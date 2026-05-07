/**
 * Agent 对话面板 — 容器组件
 *
 * 职责：管理输入、发送、取消、重置 等控制逻辑，分派事件到 chatReducer。
 * 阶段卡片渲染委托给 PhaseCardView 组件。
 */

import { useState, useEffect, useCallback, useReducer, useRef } from "react";
import { Button, Tooltip, Flex, ConfigProvider } from "antd";
import { RightOutlined, ReloadOutlined, SettingOutlined } from "@ant-design/icons";
import { Bubble, Sender } from "@ant-design/x";
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import type { AgentEvent, AgentMode, ModelConfig } from "@/api/aiApi";
import { chatReducer, initialChatState, syncMessages } from "./chatReducer";
import { PHASE_LABELS, agentTheme } from "./phaseConstants";
import SettingsModal from "./SettingsModal";
import PhaseCardView from "./PhaseCard";
import styles from "./AgentPanel.module.css";

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

  const [chatState, dispatch] = useReducer(chatReducer, initialChatState);
  const abortRef = useRef<AbortController | { close: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const checkAgentStatus = useCallback(async () => {
    const status = await getAgentStatus();
    if (status) {
      setAgentReady(status.initialized);
      setAgentStatus({ memory: status.memoryEntries, docs: status.availableDocs });
    }
  }, []);

  useEffect(() => { void checkAgentStatus(); }, [checkAgentStatus]);

  // 自动滚动
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatState]);

  const displayMessages = syncMessages(chatState);

  // ================================================================
  // 事件处理 -> dispatch
  // ================================================================

  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "phase_start":
        dispatch({ type: "PHASE_START", phase: event.phase, label: PHASE_LABELS[event.phase] || event.phase });
        break;
      case "phase_end":
        dispatch({ type: "PHASE_END" });
        break;
      case "thought":
        dispatch({ type: "THOUGHT", content: event.content });
        break;
      case "content":
        dispatch({ type: "CONTENT", content: event.content });
        break;
      case "chat_content":
        dispatch({ type: "CHAT_CONTENT", content: event.content });
        break;
      case "tool_start":
      case "tool_call":
        dispatch({ type: "TOOL_START", tool: event.tool, args: event.args });
        break;
      case "tool_result":
        dispatch({ type: "TOOL_RESULT", content: event.content, success: event.success });
        break;
      case "doc_target":
        dispatch({ type: "DOC_TARGET", fileName: event.fileName });
        break;
      case "summary":
        dispatch({ type: "SUMMARY", summaryText: event.summary_text, detail: event.detail, failedTasks: event.failed_tasks });
        setIsLoading(false);
        break;
      case "todo_list":
        dispatch({ type: "TODO_LIST", tasks: event.tasks });
        break;
      case "todo_done":
        dispatch({ type: "TODO_DONE", id: event.id });
        break;
      case "error":
        dispatch({ type: "ERROR", message: event.message });
        setIsLoading(false);
        break;
      case "phase_content":
      case "warning":
        break;
    }
  }, []);

  const handleDone = useCallback(() => {
    setIsLoading(false);
    void checkAgentStatus();
  }, [checkAgentStatus]);

  const handleError = useCallback(() => setIsLoading(false), []);

  // ================================================================
  // 发送 / 取消 / 重置
  // ================================================================

  const handleSend = useCallback((text?: string) => {
    const msg = (text || inputText).trim();
    if (!msg || isLoading) return;
    setInputText("");
    setIsLoading(true);
    dispatch({ type: "USER_MSG", content: msg });
    abortRef.current = sendAgentMessage(msg, activeDocId ?? undefined, agentMode, modelConfig, handleEvent, handleDone, handleError);
  }, [inputText, isLoading, activeDocId, agentMode, modelConfig, handleEvent, handleDone, handleError]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      "abort" in abortRef.current ? abortRef.current.abort() : abortRef.current.close();
    }
    setIsLoading(false);
  }, []);

  const handleReset = useCallback(async () => {
    await resetAgent();
    window.location.reload();
  }, []);

  // ================================================================
  // 折叠状态
  // ================================================================

  if (collapsed) {
    return (
      <div className={styles.collapsedPanel} onClick={onToggleCollapse} title="展开 Agent 面板">
        <span className={styles.expandBtn}>Agent</span>
      </div>
    );
  }

  return (
    <ConfigProvider theme={agentTheme}>
      <div className={styles.panel}>
        {/* Header */}
        <Flex justify="space-between" align="center" className={styles.header}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            Agent
            {agentStatus && (
              <span style={{ fontSize: 11, color: "#888", fontWeight: 400, marginLeft: 8 }}>
                {agentStatus.docs} 文档
              </span>
            )}
          </span>
          <Flex gap={6} align="center">
            <Tooltip title="LLM 模型设置">
              <Button size="small" icon={<SettingOutlined />} onClick={() => setShowSettings(true)} disabled={isLoading} />
            </Tooltip>
            <span style={{ fontSize: 10, color: "#888" }}>{modelConfig.model || modelConfig.provider}</span>
            <Tooltip title={agentMode === "workflow" ? "切换为对话模式" : "切换为工作流模式"}>
              <Button size="small" type={agentMode === "workflow" ? "primary" : "default"} ghost={agentMode !== "workflow"}
                onClick={() => setAgentMode(agentMode === "workflow" ? "chat" : "workflow")}
                disabled={isLoading} style={{ fontSize: 11, padding: "0 8px", height: 22 }}>
                {agentMode === "workflow" ? "工作流" : "对话"}
              </Button>
            </Tooltip>
            <Tooltip title="重置对话">
              <Button size="small" icon={<ReloadOutlined />} onClick={handleReset} disabled={isLoading} />
            </Tooltip>
            <Button size="small" onClick={onToggleCollapse} icon={<RightOutlined />} />
          </Flex>
        </Flex>

        {/* Messages */}
        <div className={styles.messages} ref={messagesContainerRef}>
          {displayMessages.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ color: "#666", fontSize: 13 }}>向 AI Agent 描述你的文档操作需求</div>
              {!agentReady && (
                <div style={{ fontSize: 11, color: "#cc4444", marginTop: 8 }}>Agent 未初始化，请检查 API Key</div>
              )}
            </div>
          )}

          {displayMessages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <Bubble placement="end" content={msg.content} className={styles.userBubble}
                  avatar={<div style={{ background: "#1677ff", width: 32, height: 32, borderRadius: "50%" }} />}
                />
              ) : (
                <div className={styles.assistantBlock}>
                  {msg.phases.map((phase, pi) => (
                    <PhaseCardView key={pi} phase={phase} msg={msg} />
                  ))}
                  {msg.streaming && msg.phases.length === 0 && (
                    <Bubble placement="start" loading content="" className={styles.assistantBubble} />
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={styles.inputArea}>
          <Sender value={inputText} onChange={setInputText} onSubmit={handleSend} onCancel={handleCancel}
            loading={isLoading}
            placeholder={agentReady ? (activeDocId ? "描述文档操作需求..." : "输入消息...") : "Agent 未就绪..."}
            disabled={!agentReady || isLoading} style={{ background: "transparent" }}
          />
        </div>

        <SettingsModal open={showSettings} currentConfig={modelConfig}
          onSave={(cfg) => { setModelConfig(cfg); setShowSettings(false); void checkAgentStatus(); }}
          onCancel={() => setShowSettings(false)}
        />
      </div>
    </ConfigProvider>
  );
}
