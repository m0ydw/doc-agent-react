/**
 * Agent 对话面板 — AssistantCard + Bubble 混合布局
 *
 * 用户消息: Bubble（一问一答感）
 * 助手消息: AssistantCard（思考+工具+正文一体化）
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Tooltip, Flex, ConfigProvider, theme } from "antd";
import { RightOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Bubble, Sender } from "@ant-design/x";
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import type { AgentEvent, AgentMode, ModelConfig, TodoListEvent } from "@/api/aiApi";
import SettingsModal from "./SettingsModal";
import AssistantCard from "./AssistantCard";
import styles from "./AgentPanel.module.css";

// ================================================================
// 类型
// ================================================================

type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string }
  | { type: "summary"; content: string }
  | { type: "todo"; tasks: Array<{ id: string; goal: string }> };

interface AssistantMsg {
  role: "assistant";
  blocks: MsgBlock[];
  streaming: boolean;
}

type Message =
  | { role: "user"; content: string }
  | AssistantMsg;

interface BuildState {
  blocks: MsgBlock[];
  currentThought: string[] | null;
}

// ================================================================
// 暗色主题
// ================================================================

const agentTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.darkAlgorithm,
  token: { colorPrimary: "#0066cc", colorBgContainer: "#1a1a2e", colorBgElevated: "#222244", colorBorder: "#3a3a5a", colorText: "#e0e0e0", colorTextSecondary: "#888888", borderRadius: 6, fontSize: 13 },
};

// ================================================================
// Props
// ================================================================

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocId?: string | null;
}

// ================================================================
// 组件
// ================================================================

export default function AgentPanel({ collapsed, onToggleCollapse, activeDocId }: AgentPanelProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("workflow");
  const [modelConfig, setModelConfig] = useState<ModelConfig>({ provider: "zhipu", model: "glm-4-flash" });
  const [showSettings, setShowSettings] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ memory: number; docs: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const stateRef = useRef<BuildState>({ blocks: [], currentThought: null });
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 快照提交
  const commitRender = useCallback(() => {
    const snapshot = stateRef.current.blocks.map(b => {
      if (b.type === "thought") return { ...b, lines: [...b.lines] };
      if (b.type === "tool_call") return { ...b };
      if (b.type === "todo") return { ...b, tasks: b.tasks.map(t => ({ ...t })) };
      return { ...b };
    });
    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") updated[updated.length - 1] = { ...last, blocks: snapshot };
      return updated;
    });
  }, []);

  const checkAgentStatus = async () => {
    const s = await getAgentStatus();
    if (s) { setAgentReady(s.initialized); setAgentStatus({ memory: s.memoryEntries, docs: s.availableDocs }); }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { checkAgentStatus(); }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ================================================================
  // SSE 事件处理
  // ================================================================

  const handleEvent = useCallback((event: AgentEvent) => {
    const s = stateRef.current;
    switch (event.type) {
      case "phase_start": case "phase_end": commitRender(); break;
      case "thought": {
        if (!s.currentThought) { s.currentThought = []; s.blocks.push({ type: "thought", lines: s.currentThought }); }
        s.currentThought.push(event.content); commitRender(); break;
      }
      case "content": case "chat_content": {
        s.currentThought = null;
        const last = s.blocks[s.blocks.length - 1];
        if (last && last.type === "text") (last as Extract<MsgBlock, { type: "text" }>).content += event.content;
        else s.blocks.push({ type: "text", content: event.content });
        commitRender(); break;
      }
      case "tool_start": {
        s.currentThought = null;
        s.blocks.push({ type: "tool_call", tool: event.tool, args: event.args, result: "" });
        commitRender(); break;
      }
      case "tool_call": {
        const last = s.blocks[s.blocks.length - 1] as Extract<MsgBlock, { type: "tool_call" }> | undefined;
        if (last && last.type === "tool_call" && last.tool === event.tool && !last.result) break;
        s.blocks.push({ type: "tool_call", tool: event.tool, args: event.args, result: "" });
        commitRender(); break;
      }
      case "tool_result": {
        for (let i = s.blocks.length - 1; i >= 0; i--) {
          if (s.blocks[i].type === "tool_call") { (s.blocks[i] as Extract<MsgBlock, { type: "tool_call" }>).result = event.content; break; }
        }
        commitRender(); break;
      }
      case "doc_target": {
        s.currentThought = null;
        const last = s.blocks[s.blocks.length - 1];
        const label = `\n> 目标文档：**${event.fileName}**\n`;
        if (last && last.type === "text") {
          const textBlock = last as Extract<MsgBlock, { type: "text" }>;
          textBlock.content = label + textBlock.content;
        }
        else s.blocks.push({ type: "text", content: label });
        commitRender(); break;
      }
      case "todo_list": {
        s.currentThought = null;
        const ev = event as TodoListEvent;
        // 替换已有的 todo block
        const existing = s.blocks.findIndex(b => b.type === "todo");
        if (existing >= 0) s.blocks[existing] = { type: "todo", tasks: ev.tasks };
        else s.blocks.push({ type: "todo", tasks: ev.tasks });
        commitRender(); break;
      }
      case "todo_done": {
        // todo 状态由 AssistantCard 根据 tool result 自动计算，此处无需处理
        break;
      }
      case "summary": {
        s.currentThought = null;
        const detail = event.detail ? `\n\n${event.detail}` : "";
        const failed = event.failed_tasks.length > 0 ? `\n\n失败任务：${event.failed_tasks.join("、")}` : "";
        s.blocks.push({ type: "summary", content: `${event.summary_text}${detail}${failed}` });
        commitRender(); setIsLoading(false); break;
      }
      case "error": {
        s.currentThought = null;
        s.blocks.push({ type: "text", content: `❌ ${event.message}` });
        commitRender(); setIsLoading(false); break;
      }
    }
  }, [commitRender]);

  const handleDone = useCallback(() => { setIsLoading(false); commitRender(); checkAgentStatus(); }, [commitRender]);
  const handleError = useCallback(() => setIsLoading(false), []);

  // ================================================================
  // 发送
  // ================================================================

  const handleSend = useCallback((text?: string) => {
    const msg = (text || inputText).trim();
    if (!msg || isLoading) return;
    setInputText(""); setIsLoading(true);
    stateRef.current = { blocks: [], currentThought: null };
    setMessages(prev => [...prev, { role: "user", content: msg }, { role: "assistant" as const, blocks: [], streaming: true }]);
    abortRef.current = sendAgentMessage(msg, activeDocId ?? undefined, agentMode, modelConfig, handleEvent, handleDone, handleError);
  }, [inputText, isLoading, activeDocId, agentMode, modelConfig, handleEvent, handleDone, handleError]);

  const handleCancel = useCallback(() => { abortRef.current?.abort(); setIsLoading(false); }, []);
  const handleReset = useCallback(async () => { await resetAgent(); setMessages([]); checkAgentStatus(); }, []);

  // ================================================================
  // 折叠
  // ================================================================

  if (collapsed) {
    return <div className={styles.collapsedPanel} onClick={onToggleCollapse} title="展开 Agent"><span className={styles.expandBtn}>Agent</span></div>;
  }

  return (
    <ConfigProvider theme={agentTheme}>
      <div className={styles.panel}>
        {/* Header */}
        <Flex justify="space-between" align="center" className={styles.header}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            Agent{agentStatus && <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>{agentStatus.docs} 文档</span>}
          </span>
          <Flex gap={6} align="center">
            <Tooltip title="模型设置"><Button size="small" icon={<SettingOutlined />} onClick={() => setShowSettings(true)} disabled={isLoading} /></Tooltip>
            <span style={{ fontSize: 10, color: "#888" }}>{modelConfig.model || modelConfig.provider}</span>
            <Tooltip title={agentMode === "workflow" ? "切换对话模式" : "切换工作流"}>
              <Button size="small" type={agentMode === "workflow" ? "primary" : "default"} ghost={agentMode !== "workflow"}
                onClick={() => setAgentMode(agentMode === "workflow" ? "chat" : "workflow")} disabled={isLoading}
                style={{ fontSize: 11, padding: "0 8px", height: 22 }}>{agentMode === "workflow" ? "工作流" : "对话"}</Button>
            </Tooltip>
            <Tooltip title="重置"><Button size="small" icon={<ReloadOutlined />} onClick={handleReset} disabled={isLoading} /></Tooltip>
            <Button size="small" onClick={onToggleCollapse} icon={<RightOutlined />} />
          </Flex>
        </Flex>

        {/* Messages */}
        <div className={styles.messages} ref={containerRef}>
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ color: "#666", fontSize: 13 }}>向 AI Agent 描述你的文档操作需求</div>
              {!agentReady && <div style={{ fontSize: 11, color: "#cc4444", marginTop: 8 }}>Agent 未初始化，检查 API Key</div>}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={styles.messageRow}>
              {msg.role === "user" ? (
                <Bubble placement="end" content={msg.content} className={styles.userBubble} />
              ) : (
                <AssistantCard blocks={msg.blocks} streaming={msg.streaming} />
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputArea}>
          <Sender value={inputText} onChange={setInputText} onSubmit={handleSend} onCancel={handleCancel}
            loading={isLoading} placeholder={agentReady ? (activeDocId ? "描述需求..." : "输入消息...") : "Agent 未就绪..."}
            disabled={!agentReady || isLoading} style={{ background: "transparent" }} />
        </div>

        <SettingsModal open={showSettings} currentConfig={modelConfig}
          onSave={c => { setModelConfig(c); setShowSettings(false); checkAgentStatus(); }}
          onCancel={() => setShowSettings(false)} />
      </div>
    </ConfigProvider>
  );
}
