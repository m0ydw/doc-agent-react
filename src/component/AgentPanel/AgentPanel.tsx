/**
 * Agent 对话面板 — 阶段卡片渲染（LangGraph Studio 风格）
 *
 * 每个阶段（analyze/plan/execute/generate/validate）渲染为独立卡片，
 * 卡片内包含该阶段的思考、工具调用、内容输出。
 * 事件驱动：phase_start 创建卡片，phase_end 完成卡片。
 */

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Tooltip, Flex, ConfigProvider, theme, Tag } from "antd";
import {
  RightOutlined,
  ReloadOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import { Bubble, Sender } from "@ant-design/x";
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import type { AgentEvent, AgentMode, ModelConfig } from "@/api/aiApi";
import SettingsModal from "./SettingsModal";
import ToolCallBlock from "./ToolCallBlock";
import xMarkdownComponents from "./xMarkdown";
import styles from "./AgentPanel.module.css";

// ================================================================
// 类型
// ================================================================

type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string; success?: boolean }
  | { type: "summary"; content: string }
  | { type: "todo"; tasks: Array<{ id: string; goal: string; status: string }> };

/** 阶段卡片 */
interface PhaseCard {
  phase: string;
  label: string;
  status: "running" | "done";
  blocks: MsgBlock[];
}

interface AssistantMsg {
  role: "assistant";
  phases: PhaseCard[];
  streaming: boolean;
}

type Message = { role: "user"; content: string } | AssistantMsg;

interface BuildState {
  phases: PhaseCard[];
  activePhase: PhaseCard | null;
  currentThought: string[] | null;
}

// ================================================================
// 阶段标签映射
// ================================================================

const PHASE_LABELS: Record<string, string> = {
  docTarget: "文档定位",
  analyze: "需求分析",
  plan: "任务规划",
  execute: "文档处理",
  generate: "内容生成",
  validate: "结果验证",
};

// ================================================================
// 暗色主题
// ================================================================

const agentTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#0066cc",
    colorBgContainer: "#1a1a2e",
    colorBgElevated: "#222244",
    colorBorder: "#3a3a5a",
    colorText: "#e0e0e0",
    colorTextSecondary: "#888888",
    borderRadius: 6,
    fontSize: 13,
  },
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

export default function AgentPanel({
  collapsed,
  onToggleCollapse,
  activeDocId,
}: AgentPanelProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("workflow");
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    provider: "zhipu",
    model: "glm-4-flash",
  });
  const [showSettings, setShowSettings] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{
    memory: number;
    docs: number;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Refs
  const stateRef = useRef<BuildState>({
    phases: [],
    activePhase: null,
    currentThought: null,
  });
  const abortRef = useRef<AbortController | { close: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 快照提交
  const commitRender = useCallback(() => {
    const snapshot = stateRef.current.phases.map((p) => ({
      ...p,
      blocks: p.blocks.map((b) => {
        if (b.type === "thought") return { ...b, lines: [...b.lines] };
        return { ...b };
      }),
    }));
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = { ...last, phases: snapshot };
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    checkAgentStatus();
  }, []);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkAgentStatus = async () => {
    const status = await getAgentStatus();
    if (status) {
      setAgentReady(status.initialized);
      setAgentStatus({
        memory: status.memoryEntries,
        docs: status.availableDocs,
      });
    }
  };

  // ================================================================
  // SSE 事件处理
  // ================================================================

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;

      switch (event.type) {
        case "phase_start": {
          const phase = event.phase;
          const card: PhaseCard = {
            phase,
            label: PHASE_LABELS[phase] || phase,
            status: "running",
            blocks: [],
          };
          state.phases.push(card);
          state.activePhase = card;
          state.currentThought = null;
          commitRender();
          break;
        }
        case "phase_end": {
          if (state.activePhase) {
            state.activePhase.status = "done";
          }
          state.activePhase = null;
          state.currentThought = null;
          commitRender();
          break;
        }
        case "phase_status": {
          break;
        }
        case "thought": {
          if (!state.activePhase) break;
          const ap = state.activePhase;
          if (!state.currentThought) {
            state.currentThought = [];
            ap.blocks.push({ type: "thought", lines: state.currentThought });
          }
          state.currentThought.push(event.content);
          commitRender();
          break;
        }
        case "content": {
          state.currentThought = null;
          const ap = state.activePhase;
          const targetBlocks = ap ? ap.blocks : state.phases[state.phases.length - 1]?.blocks || [];
          const lastBlock = targetBlocks[targetBlocks.length - 1];
          if (lastBlock && lastBlock.type === "text") {
            (lastBlock as Extract<MsgBlock, { type: "text" }>).content += event.content;
          } else {
            targetBlocks.push({ type: "text", content: event.content });
          }
          commitRender();
          break;
        }
        case "chat_content": {
          state.currentThought = null;
          const lastBlock = state.phases[state.phases.length - 1]?.blocks?.slice(-1)[0];
          if (lastBlock && lastBlock.type === "text") {
            (lastBlock as Extract<MsgBlock, { type: "text" }>).content += event.content;
          } else {
            state.phases[state.phases.length - 1]?.blocks.push({ type: "text", content: event.content });
          }
          commitRender();
          break;
        }
        case "tool_start": {
          state.currentThought = null;
          const ap = state.activePhase || state.phases[state.phases.length - 1];
          if (!ap) break;
          ap.blocks.push({ type: "tool_call", tool: event.tool, args: event.args, result: "" });
          commitRender();
          break;
        }
        case "tool_call": {
          state.currentThought = null;
          const ap = state.activePhase || state.phases[state.phases.length - 1];
          if (!ap) break;
          const last = ap.blocks[ap.blocks.length - 1];
          if (last && last.type === "tool_call" && last.tool === event.tool && last.result === "") break;
          ap.blocks.push({ type: "tool_call", tool: event.tool, args: event.args, result: "" });
          commitRender();
          break;
        }
        case "tool_result": {
          const ap = state.activePhase || state.phases[state.phases.length - 1];
          if (!ap) break;
          for (let i = ap.blocks.length - 1; i >= 0; i--) {
            const b = ap.blocks[i];
            if (b.type === "tool_call") {
              const tc = b as Extract<MsgBlock, { type: "tool_call" }>;
              tc.result = event.content;
              tc.success = event.success;
              break;
            }
          }
          commitRender();
          break;
        }
        case "doc_target": {
          state.currentThought = null;
          state.phases[0]?.blocks.push({ type: "text", content: `目标文档：${event.fileName}` });
          commitRender();
          break;
        }
        case "summary": {
          state.currentThought = null;
          state.activePhase = null;
          const detail = event.detail ? `\n\n${event.detail}` : "";
          const failed = event.failed_tasks.length > 0 ? `\n\n失败：${event.failed_tasks.join("、")}` : "";
          // summary 放在最后一个阶段的 blocks 中
          const lastPhase = state.phases[state.phases.length - 1];
          if (lastPhase) {
            lastPhase.blocks.push({ type: "summary", content: `${event.summary_text}${detail}${failed}` });
          }
          commitRender();
          setIsLoading(false);
          break;
        }
        case "todo_list": {
          state.currentThought = null;
          const tasks = event.tasks.map((t) => ({ id: t.id, goal: t.goal, status: "pending" as const }));
          const ap = state.activePhase || state.phases[state.phases.length - 1];
          if (ap) ap.blocks.push({ type: "todo", tasks });
          commitRender();
          break;
        }
        case "todo_done": {
          const ap = state.activePhase || state.phases[state.phases.length - 1];
          if (!ap) break;
          for (let i = ap.blocks.length - 1; i >= 0; i--) {
            const b = ap.blocks[i];
            if (b.type === "todo") {
              const task = (b as Extract<MsgBlock, { type: "todo" }>).tasks.find((t) => t.id === event.id);
              if (task) task.status = "done";
              break;
            }
          }
          commitRender();
          break;
        }
        case "error": {
          state.currentThought = null;
          state.activePhase = null;
          const lastPhase = state.phases[state.phases.length - 1];
          if (lastPhase) {
            lastPhase.blocks.push({ type: "text", content: `错误：${event.message}` });
          }
          commitRender();
          setIsLoading(false);
          break;
        }
      }
    },
    [commitRender]
  );

  const handleDone = useCallback(() => {
    setIsLoading(false);
    commitRender();
    checkAgentStatus();
  }, [commitRender]);
  const handleError = useCallback(() => setIsLoading(false), []);

  // ================================================================
  // 发送 / 取消 / 重置
  // ================================================================

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || inputText).trim();
      if (!msg || isLoading) return;
      setInputText("");
      setIsLoading(true);
      stateRef.current = {
        phases: [],
        activePhase: null,
        currentThought: null,
      };
      setMessages((prev) => [...prev, { role: "user", content: msg }]);
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, phases: [], streaming: true },
      ]);
      abortRef.current = sendAgentMessage(
        msg,
        activeDocId ?? undefined,
        agentMode,
        modelConfig,
        handleEvent,
        handleDone,
        handleError
      );
    },
    [
      inputText,
      isLoading,
      activeDocId,
      agentMode,
      modelConfig,
      handleEvent,
      handleDone,
      handleError,
    ]
  );

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      "abort" in abortRef.current ? abortRef.current.abort() : abortRef.current.close();
    }
    setIsLoading(false);
  }, []);
  const handleReset = useCallback(async () => {
    await resetAgent();
    setMessages([]);
    checkAgentStatus();
  }, []);

  // ================================================================
  // 折叠状态
  // ================================================================

  if (collapsed) {
    return (
      <div
        className={styles.collapsedPanel}
        onClick={onToggleCollapse}
        title="展开 Agent 面板"
      >
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
              <span
                style={{
                  fontSize: 11,
                  color: "#888",
                  fontWeight: 400,
                  marginLeft: 8,
                }}
              >
                {agentStatus.docs} 文档
              </span>
            )}
          </span>
          <Flex gap={6} align="center">
            <Tooltip title="LLM 模型设置">
              <Button
                size="small"
                icon={<SettingOutlined />}
                onClick={() => setShowSettings(true)}
                disabled={isLoading}
              />
            </Tooltip>
            <span style={{ fontSize: 10, color: "#888" }}>
              {modelConfig.model || modelConfig.provider}
            </span>
            <Tooltip
              title={
                agentMode === "workflow" ? "切换为对话模式" : "切换为工作流模式"
              }
            >
              <Button
                size="small"
                type={agentMode === "workflow" ? "primary" : "default"}
                ghost={agentMode !== "workflow"}
                onClick={() =>
                  setAgentMode(agentMode === "workflow" ? "chat" : "workflow")
                }
                disabled={isLoading}
                style={{ fontSize: 11, padding: "0 8px", height: 22 }}
              >
                {agentMode === "workflow" ? "工作流" : "对话"}
              </Button>
            </Tooltip>
            <Tooltip title="重置对话">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleReset}
                disabled={isLoading}
              />
            </Tooltip>
            <Button
              size="small"
              onClick={onToggleCollapse}
              icon={<RightOutlined />}
            />
          </Flex>
        </Flex>

        {/* Messages */}
        <div className={styles.messages} ref={messagesContainerRef}>
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ color: "#666", fontSize: 13 }}>
                向 AI Agent 描述你的文档操作需求
              </div>
              {!agentReady && (
                <div style={{ fontSize: 11, color: "#cc4444", marginTop: 8 }}>
                  Agent 未初始化，请检查 API Key
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <Bubble
                  placement="end"
                  content={msg.content}
                  className={styles.userBubble}
                  avatar={<div style={{ background: "#1677ff", width: 32, height: 32, borderRadius: "50%" }} />}
                />
              ) : (
                <div className={styles.assistantBlock}>
                  {/* 阶段卡片 */}
                  {msg.phases.map((phase, pi) => (
                    <div key={pi} className={styles.phaseCard}>
                      <div className={styles.phaseCardHeader}>
                        <span className={styles.phaseCardIcon}>
                          {phase.status === "running"
                            ? <LoadingOutlined spin style={{ color: "#1890ff", fontSize: 14 }} />
                            : <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 14 }} />}
                        </span>
                        <span className={styles.phaseCardLabel}>{phase.label}</span>
                        <Tag color={phase.status === "running" ? "processing" : "success"} style={{ fontSize: 10, marginLeft: 8 }}>
                          {phase.status === "running" ? "进行中" : "完成"}
                        </Tag>
                      </div>
                      <div className={styles.phaseCardBody}>
                        {/* 思考过程 */}
                        {phase.blocks
                          .filter((b) => b.type === "thought")
                          .map((b, bi) => {
                            const thought = b as Extract<MsgBlock, { type: "thought" }>;
                            return (
                              <details key={bi} className={styles.thoughtSection}>
                                <summary className={styles.thoughtSummary}>思考内容</summary>
                                <div className={styles.thoughtBody}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                                    {thought.lines.join("\n\n")}
                                  </ReactMarkdown>
                                </div>
                              </details>
                            );
                          })}

                        {/* 工具调用 */}
                        {phase.blocks
                          .filter((b) => b.type === "tool_call")
                          .map((b, bi) => {
                            const tc = b as Extract<MsgBlock, { type: "tool_call" }>;
                            return <ToolCallBlock key={bi} tool={tc.tool} args={tc.args} result={tc.result} success={tc.success} />;
                          })}

                        {/* Todo */}
                        {phase.blocks
                          .filter((b) => b.type === "todo")
                          .map((b, bi) => {
                            const todo = b as Extract<MsgBlock, { type: "todo" }>;
                            return (
                              <div key={bi} className={styles.todoList}>
                                {todo.tasks.map((task) => (
                                  <div key={task.id} className={`${styles.todoItem} ${task.status === "done" ? styles.todoItemDone : task.status === "pending" ? styles.todoItemPending : ""}`}>
                                    <span className={styles.todoCheck}>
                                      {task.status === "done" ? <CheckCircleOutlined style={{ color: "#52c41a" }} /> : task.status === "running" ? <LoadingOutlined spin style={{ color: "#1890ff" }} /> : <MinusOutlined style={{ color: "#555" }} />}
                                    </span>
                                    <span className={`${styles.todoGoal} ${task.status === "done" ? styles.todoGoalDone : ""}`}>{task.goal}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}

                        {/* 文本 / 总结 */}
                        {phase.blocks
                          .filter((b) => b.type === "text" || b.type === "summary")
                          .map((b, bi) => {
                            const text = b as Extract<MsgBlock, { type: "text" | "summary" }>;
                            const isLast = bi === phase.blocks.filter(b2 => b2.type === "text" || b2.type === "summary").length - 1;
                            return (
                              <Bubble
                                key={bi}
                                placement="start"
                                content={text.content}
                                className={styles.assistantBubble}
                                typing={msg.streaming && isLast ? true : undefined}
                                contentRender={(content: string) => (
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                                    {content}
                                  </ReactMarkdown>
                                )}
                              />
                            );
                          })}
                      </div>
                    </div>
                  ))}

                  {/* 空状态 loading */}
                  {msg.streaming && msg.phases.length === 0 && (
                    <Bubble placement="start" loading content="" className={styles.assistantBubble} />
                  )}
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input — Sender */}
        <div className={styles.inputArea}>
          <Sender
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSend}
            onCancel={handleCancel}
            loading={isLoading}
            placeholder={
              agentReady
                ? activeDocId
                  ? "描述文档操作需求..."
                  : "输入消息..."
                : "Agent 未就绪..."
            }
            disabled={!agentReady || isLoading}
            style={{ background: "transparent" }}
          />
        </div>

        {/* Settings Modal */}
        <SettingsModal
          open={showSettings}
          currentConfig={modelConfig}
          onSave={(config) => {
            setModelConfig(config);
            setShowSettings(false);
            checkAgentStatus();
          }}
          onCancel={() => setShowSettings(false)}
        />
      </div>
    </ConfigProvider>
  );
}
