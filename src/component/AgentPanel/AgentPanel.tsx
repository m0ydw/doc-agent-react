/**
 * Agent 对话面板 — 阶段卡片渲染（LangGraph Studio 风格）
 *
 * 使用 useReducer 进行不可变状态管理，替换旧的 useRef mutate + commitRender 模式。
 */

import { useState, useEffect, useCallback, useReducer, useRef } from "react";
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
  | {
      type: "tool_call";
      tool: string;
      args: string;
      result: string;
      success?: boolean;
    }
  | { type: "summary"; content: string }
  | {
      type: "todo";
      tasks: Array<{ id: string; goal: string; status: string }>;
    };

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

// ================================================================
// Reducer 状态 & Action
// ================================================================

interface ChatState {
  messages: Message[];
  phases: PhaseCard[];
  activePhase: PhaseCard | null;
  currentThought: string[] | null;
}

type ChatAction =
  | { type: "USER_MSG"; content: string }
  | { type: "PHASE_START"; phase: string; label: string }
  | { type: "PHASE_END" }
  | { type: "THOUGHT"; content: string }
  | { type: "CONTENT"; content: string }
  | { type: "CHAT_CONTENT"; content: string }
  | { type: "TOOL_START"; tool: string; args: string }
  | { type: "TOOL_RESULT"; content: string; success: boolean }
  | { type: "DOC_TARGET"; fileName: string }
  | {
      type: "SUMMARY";
      summaryText: string;
      detail: string;
      failedTasks: string[];
    }
  | { type: "TODO_LIST"; tasks: Array<{ id: string; goal: string }> }
  | { type: "TODO_DONE"; id: string }
  | { type: "ERROR"; message: string };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "USER_MSG": {
      return {
        messages: [
          ...state.messages,
          { role: "user", content: action.content },
          { role: "assistant", phases: [], streaming: true },
        ],
        phases: [],
        activePhase: null,
        currentThought: null,
      };
    }

    case "PHASE_START": {
      const card: PhaseCard = {
        phase: action.phase,
        label: action.label,
        status: "running",
        blocks: [],
      };
      return {
        ...state,
        phases: [...state.phases, card],
        activePhase: card,
        currentThought: null,
      };
    }

    case "PHASE_END": {
      const newPhases = state.phases.map((p) =>
        p === state.activePhase ? { ...p, status: "done" as const } : p
      );
      return {
        ...state,
        phases: newPhases,
        activePhase: null,
        currentThought: null,
      };
    }

    case "THOUGHT": {
      const ap = state.activePhase;
      if (!ap) return state;

      const newPhases = state.phases.map((p) => {
        if (p !== ap) return p;
        const hasThought = p.blocks.some((b) => b.type === "thought");
        if (hasThought) {
          // 追加到最后一个 thought block
          return {
            ...p,
            blocks: p.blocks.map((b) => {
              if (b.type === "thought")
                return {
                  ...b,
                  lines: [...(b as { lines: string[] }).lines, action.content],
                };
              return b;
            }),
          };
        }
        // 创建新 thought block
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { type: "thought" as const, lines: [action.content] },
          ],
        };
      });

      return { ...state, phases: newPhases, currentThought: null };
    }

    case "CONTENT": {
      const targetPhase =
        state.activePhase || state.phases[state.phases.length - 1];
      if (!targetPhase) return state;

      const newPhases = state.phases.map((p) => {
        if (p !== targetPhase) return p;
        const lastBlock = p.blocks[p.blocks.length - 1];
        if (lastBlock?.type === "text") {
          return {
            ...p,
            blocks: p.blocks.map((b, i) =>
              i === p.blocks.length - 1
                ? {
                    ...b,
                    content:
                      (b as { content: string }).content + action.content,
                  }
                : b
            ),
          };
        }
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { type: "text" as const, content: action.content },
          ],
        };
      });

      return { ...state, phases: newPhases, currentThought: null };
    }

    case "CHAT_CONTENT": {
      if (state.phases.length === 0) return state;
      const lastPhase = state.phases[state.phases.length - 1];
      const lastBlock = lastPhase.blocks[lastPhase.blocks.length - 1];

      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        if (lastBlock?.type === "text") {
          return {
            ...p,
            blocks: p.blocks.map((b, j) =>
              j === p.blocks.length - 1
                ? {
                    ...b,
                    content:
                      (b as { content: string }).content + action.content,
                  }
                : b
            ),
          };
        }
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { type: "text" as const, content: action.content },
          ],
        };
      });

      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TOOL_START": {
      const targetPhase =
        state.activePhase || state.phases[state.phases.length - 1];
      if (!targetPhase) return state;

      const newPhases = state.phases.map((p) => {
        if (p !== targetPhase) return p;
        return {
          ...p,
          blocks: [
            ...p.blocks,
            {
              type: "tool_call" as const,
              tool: action.tool,
              args: action.args,
              result: "",
            },
          ],
        };
      });

      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TOOL_RESULT": {
      const targetPhase =
        state.activePhase || state.phases[state.phases.length - 1];
      if (!targetPhase) return state;

      const newPhases = state.phases.map((p) => {
        if (p !== targetPhase) return p;
        // 从后往前找最后一个空 result 的 tool_call
        const newBlocks = [...p.blocks];
        for (let i = newBlocks.length - 1; i >= 0; i--) {
          if (
            newBlocks[i].type === "tool_call" &&
            (newBlocks[i] as { result: string }).result === ""
          ) {
            newBlocks[i] = {
              ...newBlocks[i],
              result: action.content,
              success: action.success,
            };
            break;
          }
        }
        return { ...p, blocks: newBlocks };
      });

      return { ...state, phases: newPhases };
    }

    case "DOC_TARGET": {
      if (state.phases.length === 0) return state;
      const newPhases = state.phases.map((p, i) => {
        if (i !== 0) return p;
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { type: "text" as const, content: `目标文档：${action.fileName}` },
          ],
        };
      });
      return { ...state, phases: newPhases, currentThought: null };
    }

    case "SUMMARY": {
      const detail = action.detail ? `\n\n${action.detail}` : "";
      const failed =
        action.failedTasks.length > 0
          ? `\n\n失败：${action.failedTasks.join("、")}`
          : "";

      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        return {
          ...p,
          blocks: [
            ...p.blocks,
            {
              type: "summary" as const,
              content: `${action.summaryText}${detail}${failed}`,
            },
          ],
        };
      });

      return {
        ...state,
        phases: newPhases,
        activePhase: null,
        currentThought: null,
      };
    }

    case "TODO_LIST": {
      const targetPhase =
        state.activePhase || state.phases[state.phases.length - 1];
      if (!targetPhase) return state;

      const tasks = action.tasks.map((t) => ({
        id: t.id,
        goal: t.goal,
        status: "pending" as const,
      }));

      const newPhases = state.phases.map((p) => {
        if (p !== targetPhase) return p;
        return {
          ...p,
          blocks: [...p.blocks, { type: "todo" as const, tasks }],
        };
      });

      return { ...state, phases: newPhases, currentThought: null };
    }

    case "TODO_DONE": {
      const targetPhase =
        state.activePhase || state.phases[state.phases.length - 1];
      if (!targetPhase) return state;

      const newPhases = state.phases.map((p) => {
        if (p !== targetPhase) return p;
        const newBlocks = p.blocks.map((b) => {
          if (b.type !== "todo") return b;
          return {
            ...b,
            tasks: (
              b as {
                tasks: Array<{ id: string; goal: string; status: string }>;
              }
            ).tasks.map((t) =>
              t.id === action.id ? { ...t, status: "done" as const } : t
            ),
          };
        });
        return { ...p, blocks: newBlocks };
      });

      return { ...state, phases: newPhases };
    }

    case "ERROR": {
      const newPhases = state.phases.map((p, i) => {
        if (i !== state.phases.length - 1) return p;
        return {
          ...p,
          blocks: [
            ...p.blocks,
            { type: "text" as const, content: `错误：${action.message}` },
          ],
        };
      });

      return {
        ...state,
        phases: newPhases,
        activePhase: null,
        currentThought: null,
      };
    }

    default:
      return state;
  }
}

// 同步 messages 中的 phases（从 state 到 messages 的"派生"同步）
function syncMessages(state: ChatState): Message[] {
  const updated = [...state.messages];
  const last = updated[updated.length - 1];
  if (last && last.role === "assistant") {
    updated[updated.length - 1] = {
      ...last,
      phases: state.phases,
    };
  }
  return updated;
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

  // 核心状态 — 使用 useReducer 替代 useRef mutate
  const [chatState, dispatch] = useReducer(chatReducer, {
    messages: [],
    phases: [],
    activePhase: null,
    currentThought: null,
  });

  const abortRef = useRef<AbortController | { close: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const checkAgentStatus = useCallback(async () => {
    const status = await getAgentStatus();
    if (status) {
      setAgentReady(status.initialized);
      setAgentStatus({
        memory: status.memoryEntries,
        docs: status.availableDocs,
      });
    }
  }, []);

  useEffect(() => {
    void checkAgentStatus();
  }, [checkAgentStatus]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatState.messages]);

  // 派生：从 phases 同步到 messages
  const displayMessages = syncMessages(chatState);

  // ================================================================
  // 事件处理 → dispatch action
  // ================================================================

  const handleEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case "phase_start":
        dispatch({
          type: "PHASE_START",
          phase: event.phase,
          label: PHASE_LABELS[event.phase] || event.phase,
        });
        break;
      case "phase_end":
        dispatch({ type: "PHASE_END" });
        break;
      case "phase_status":
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
        dispatch({ type: "TOOL_START", tool: event.tool, args: event.args });
        break;
      case "tool_call":
        dispatch({ type: "TOOL_START", tool: event.tool, args: event.args });
        break;
      case "tool_result":
        dispatch({
          type: "TOOL_RESULT",
          content: event.content,
          success: event.success,
        });
        break;
      case "doc_target":
        dispatch({ type: "DOC_TARGET", fileName: event.fileName });
        break;
      case "summary":
        dispatch({
          type: "SUMMARY",
          summaryText: event.summary_text,
          detail: event.detail,
          failedTasks: event.failed_tasks,
        });
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

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || inputText).trim();
      if (!msg || isLoading) return;
      setInputText("");
      setIsLoading(true);
      dispatch({ type: "USER_MSG", content: msg });

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
      "abort" in abortRef.current
        ? abortRef.current.abort()
        : abortRef.current.close();
    }
    setIsLoading(false);
  }, []);

  const handleReset = useCallback(async () => {
    await resetAgent();
    // 重置聊天状态
    window.location.reload();
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
          {displayMessages.length === 0 && (
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

          {displayMessages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <Bubble
                  placement="end"
                  content={msg.content}
                  className={styles.userBubble}
                  avatar={
                    <div
                      style={{
                        background: "#1677ff",
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                      }}
                    />
                  }
                />
              ) : (
                <div className={styles.assistantBlock}>
                  {/* 阶段卡片 */}
                  {msg.phases.map((phase, pi) => (
                    <div key={pi} className={styles.phaseCard}>
                      <div className={styles.phaseCardHeader}>
                        <span className={styles.phaseCardIcon}>
                          {phase.status === "running" ? (
                            <LoadingOutlined
                              spin
                              style={{ color: "#1890ff", fontSize: 14 }}
                            />
                          ) : (
                            <CheckCircleOutlined
                              style={{ color: "#52c41a", fontSize: 14 }}
                            />
                          )}
                        </span>
                        <span className={styles.phaseCardLabel}>
                          {phase.label}
                        </span>
                        <Tag
                          color={
                            phase.status === "running"
                              ? "processing"
                              : "success"
                          }
                          style={{ fontSize: 10, marginLeft: 8 }}
                        >
                          {phase.status === "running" ? "进行中" : "完成"}
                        </Tag>
                      </div>
                      <div className={styles.phaseCardBody}>
                        {/* 思考过程 */}
                        {phase.blocks
                          .filter((b) => b.type === "thought")
                          .map((b, bi) => {
                            const thought = b as Extract<
                              MsgBlock,
                              { type: "thought" }
                            >;
                            return (
                              <details
                                key={bi}
                                className={styles.thoughtSection}
                              >
                                <summary className={styles.thoughtSummary}>
                                  思考内容
                                </summary>
                                <div className={styles.thoughtBody}>
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={xMarkdownComponents}
                                  >
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
                            const tc = b as Extract<
                              MsgBlock,
                              { type: "tool_call" }
                            >;
                            return (
                              <ToolCallBlock
                                key={bi}
                                tool={tc.tool}
                                args={tc.args}
                                result={tc.result}
                                success={tc.success}
                              />
                            );
                          })}

                        {/* Todo */}
                        {phase.blocks
                          .filter((b) => b.type === "todo")
                          .map((b, bi) => {
                            const todo = b as Extract<
                              MsgBlock,
                              { type: "todo" }
                            >;
                            return (
                              <div key={bi} className={styles.todoList}>
                                {todo.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className={`${styles.todoItem} ${
                                      task.status === "done"
                                        ? styles.todoItemDone
                                        : task.status === "pending"
                                        ? styles.todoItemPending
                                        : ""
                                    }`}
                                  >
                                    <span className={styles.todoCheck}>
                                      {task.status === "done" ? (
                                        <CheckCircleOutlined
                                          style={{ color: "#52c41a" }}
                                        />
                                      ) : task.status === "running" ? (
                                        <LoadingOutlined
                                          spin
                                          style={{ color: "#1890ff" }}
                                        />
                                      ) : (
                                        <MinusOutlined
                                          style={{ color: "#555" }}
                                        />
                                      )}
                                    </span>
                                    <span
                                      className={`${styles.todoGoal} ${
                                        task.status === "done"
                                          ? styles.todoGoalDone
                                          : ""
                                      }`}
                                    >
                                      {task.goal}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}

                        {/* 文本 / 总结 */}
                        {phase.blocks
                          .filter(
                            (b) => b.type === "text" || b.type === "summary"
                          )
                          .map((b, bi) => {
                            const text = b as Extract<
                              MsgBlock,
                              { type: "text" | "summary" }
                            >;
                            const textSummaries = phase.blocks.filter(
                              (b2) =>
                                b2.type === "text" || b2.type === "summary"
                            );
                            const isLast = bi === textSummaries.length - 1;
                            return (
                              <Bubble
                                key={bi}
                                placement="start"
                                content={text.content}
                                className={styles.assistantBubble}
                                typing={
                                  msg.streaming && isLast ? true : undefined
                                }
                                contentRender={(content: string) => (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={xMarkdownComponents}
                                  >
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
                    <Bubble
                      placement="start"
                      loading
                      content=""
                      className={styles.assistantBubble}
                    />
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
          onSave={(cfg) => {
            setModelConfig(cfg);
            setShowSettings(false);
            void checkAgentStatus();
          }}
          onCancel={() => setShowSettings(false)}
        />
      </div>
    </ConfigProvider>
  );
}
