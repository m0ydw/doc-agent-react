/**
 * Agent 对话面板 — Trae 风格流式输出
 *
 * 数据结构：扁平块列表（text / thought / tool_call / summary）
 * 流式输出：即时显示文本，thought 可折叠
 * 渲染：react-markdown 支持 LLM Markdown 输出
 * 原则：无 emoji、无 Card/Result 包装、纯文字叙述
 */
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import {
  Collapse, Tag, Spin, Button, Tooltip, Input, Flex,
  ConfigProvider, theme,
} from "antd";
import type { InputRef } from "antd";
import {
  RobotOutlined, UserOutlined,
  RightOutlined, ReloadOutlined,
  SendOutlined, StopOutlined,
} from "@ant-design/icons";
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import type { AgentEvent, AgentMode } from "@/api/aiApi";
import styles from "./AgentPanel.module.css";

// ================================================================
// 扁平块类型定义
// ================================================================

type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string }
  | { type: "summary"; content: string };

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
  activePhase: string | null;
}

// ================================================================
// 工具标签
// ================================================================

const TOOL_LABELS: Record<string, string> = {
  sdk_get_text: "读取全文",
  sdk_find_text: "查找文本",
  sdk_replace_text: "替换文本",
  sdk_replace_all: "全部替换",
  sdk_save: "保存文档",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] || tool;
}

// ================================================================
// react-markdown 自定义组件（暗色主题适配）
// ================================================================

const mdComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#66b3ff" }}>
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          style={{
            background: "#2a2a4a",
            padding: "1px 5px",
            borderRadius: 3,
            fontSize: "0.9em",
            color: "#e0e0e0",
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <pre
        style={{
          background: "#2a2a4a",
          padding: 10,
          borderRadius: 6,
          overflow: "auto",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  // 列表样式
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "4px 0" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "2px 0" }}>{children}</li>,
  // 段落样式 — 紧凑，无额外 margin
  p: ({ children }) => <div style={{ margin: "4px 0", lineHeight: 1.6 }}>{children}</div>,
  // 标题
  h1: ({ children }) => <div style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 4px", color: "#fff" }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontSize: 14, fontWeight: 600, margin: "6px 0 4px", color: "#fff" }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, margin: "4px 0", color: "#fff" }}>{children}</div>,
};

// ================================================================
// Agent 面板暗色主题
// ================================================================

const agentTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#0066cc",
    colorBgContainer: "#1a1a2e",
    colorBgElevated: "#222244",
    colorBorder: "#3a3a5a",
    colorBorderSecondary: "#2a2a4a",
    colorText: "#e0e0e0",
    colorTextSecondary: "#888888",
    colorBgTextHover: "rgba(255,255,255,0.04)",
    borderRadius: 6,
    fontSize: 13,
    fontSizeSM: 12,
  },
};

// ================================================================
// 组件
// ================================================================

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocId?: string | null;
}

export default function AgentPanel({
  collapsed,
  onToggleCollapse,
  activeDocId,
}: AgentPanelProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("workflow");
  const [agentReady, setAgentReady] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{
    memory: number;
    docs: number;
  } | null>(null);

  // 消息列表（驱动渲染）
  const [messages, setMessages] = useState<Message[]>([]);

  // --- Refs ---
  const stateRef = useRef<BuildState>({
    blocks: [],
    currentThought: null,
    activePhase: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);

  // --- 渲染提交（快照模式） ---
  // 关键：在调用时拍下 blocks 快照，避免 React 批处理后 updater 读到被后续事件改过的引用
  const commitRender = useCallback(() => {
    const snapshot = stateRef.current.blocks.map((b) => {
      if (b.type === "thought") return { ...b, lines: [...b.lines] };
      if (b.type === "tool_call") return { ...b };
      return { ...b };
    });
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = {
          ...last,
          blocks: snapshot,
        };
      }
      return updated;
    });
  }, []);

  // 启动时检查 Agent 状态
  useEffect(() => {
    checkAgentStatus();
  }, []);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!collapsed) inputRef.current?.focus();
  }, [collapsed]);

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
  // 事件处理
  // ================================================================

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      const state = stateRef.current;

      switch (event.type) {
        // 阶段开始 → 显示阶段标签
        case "phase_start": {
          state.activePhase = event.phase;
          commitRender();
          break;
        }

        // 阶段结束 → 移除阶段标签
        case "phase_end": {
          if (state.activePhase === event.phase) {
            state.activePhase = null;
          }
          commitRender();
          break;
        }

        // 思考过程 → 追加到当前 thought 块
        case "thought": {
          if (!state.currentThought) {
            state.currentThought = [];
            state.blocks.push({
              type: "thought",
              lines: state.currentThought,
            });
          }
          state.currentThought.push(event.content);
          commitRender();
          break;
        }

        // 用户可见内容 → 关闭 thought，追加 text 块
        case "content": {
          state.currentThought = null;
          state.blocks.push({ type: "text", content: event.content });
          commitRender();
          break;
        }

        // React Agent 模式流式文本 → 追加到当前 text 块（合并连续输出）
        case "chat_content": {
          state.currentThought = null;
          const lastBlock = state.blocks[state.blocks.length - 1];
          if (lastBlock && lastBlock.type === "text") {
            (lastBlock as Extract<MsgBlock, { type: "text" }>).content += event.content;
          } else {
            state.blocks.push({ type: "text", content: event.content });
          }
          commitRender();
          break;
        }

        // 工具调用开始 — 创建带 loading 状态的 tool_call 块
        case "tool_start": {
          state.currentThought = null;
          state.blocks.push({
            type: "tool_call",
            tool: event.tool,
            args: event.args,
            result: "",
          });
          commitRender();
          break;
        }

        // 工具调用 — 如果已有 tool_start 则忽略（去重），否则创建
        case "tool_call": {
          state.currentThought = null;
          const last = state.blocks[state.blocks.length - 1];
          // 如果上一个块已经是同一工具的 tool_call（由 tool_start 创建），跳过
          if (last && last.type === "tool_call" && last.tool === event.tool && last.result === "") {
            break;
          }
          state.blocks.push({
            type: "tool_call",
            tool: event.tool,
            args: event.args,
            result: "",
          });
          commitRender();
          break;
        }

        // 工具执行结果 → 更新最后一个 tool_call
        case "tool_result": {
          for (let i = state.blocks.length - 1; i >= 0; i--) {
            const b = state.blocks[i];
            if (b.type === "tool_call") {
              (b as Extract<MsgBlock, { type: "tool_call" }>).result =
                event.content;
              break;
            }
          }
          commitRender();
          break;
        }

        // 文档目标
        case "doc_target": {
          state.currentThought = null;
          state.blocks.push({
            type: "text",
            content: `目标文档：${event.fileName}`,
          });
          commitRender();
          break;
        }

        // 总结 → 纯文字块
        case "summary": {
          state.currentThought = null;
          state.activePhase = null;
          const detail = event.detail ? `\n\n${event.detail}` : "";
          const failed =
            event.failed_tasks.length > 0
              ? `\n\n失败任务：${event.failed_tasks.join("、")}`
              : "";
          state.blocks.push({
            type: "summary",
            content: `${event.summary_text}${detail}${failed}`,
          });
          commitRender();
          setIsLoading(false);
          break;
        }

        // 错误
        case "error": {
          state.currentThought = null;
          state.activePhase = null;
          state.blocks.push({
            type: "text",
            content: `错误：${event.message}`,
          });
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

  const handleError = useCallback(
    () => {
      setIsLoading(false);
    },
    []
  );

  // ================================================================
  // 发送 / 取消 / 重置
  // ================================================================

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    setIsLoading(true);

    // 重置构建状态
    stateRef.current = {
      blocks: [],
      currentThought: null,
      activePhase: null,
    };

    // 添加用户消息
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    // 添加占位的 assistant 消息
    setMessages((prev) => [
      ...prev,
      { role: "assistant" as const, blocks: [], streaming: true },
    ]);

    abortRef.current = sendAgentMessage(
      text,
      activeDocId ?? undefined,
      agentMode,
      handleEvent,
      handleDone,
      handleError
    );
  }, [inputText, isLoading, activeDocId, agentMode, handleEvent, handleDone, handleError]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const handleReset = useCallback(async () => {
    await resetAgent();
    setMessages([]);
    checkAgentStatus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

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

  // ================================================================
  // 渲染
  // ================================================================

  return (
    <ConfigProvider theme={agentTheme}>
      <div className={styles.panel}>
        {/* Header */}
        <Flex justify="space-between" align="center" className={styles.header}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            <RobotOutlined style={{ marginRight: 6 }} />
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
            <Tooltip title={agentMode === "workflow" ? "切换为对话模式（Chat）" : "切换为工作流模式（Workflow）"}>
              <Button
                size="small"
                type={agentMode === "workflow" ? "primary" : "default"}
                ghost={agentMode !== "workflow"}
                onClick={() => setAgentMode(agentMode === "workflow" ? "chat" : "workflow")}
                disabled={isLoading}
                style={{
                  fontSize: 11,
                  padding: "0 8px",
                  height: 22,
                }}
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
        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.emptyState}>
              <RobotOutlined style={{ fontSize: 32, opacity: 0.3 }} />
              <div style={{ color: "#666", fontSize: 13 }}>
                向 AI Agent 描述你的文档操作需求
              </div>
              {!activeDocId && (
                <div style={{ fontSize: 11, color: "#555" }}>
                  提示：打开一个文档后 Agent 可以自动识别
                </div>
              )}
              {!agentReady && (
                <div style={{ fontSize: 11, color: "#cc4444" }}>
                  Agent 未初始化，请检查 API Key 配置
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "user" ? (
                <div className={styles.userMessageRow}>
                  <div className={styles.userBubble}>{msg.content}</div>
                  <UserOutlined className={styles.userIcon} />
                </div>
              ) : (
                <div className={styles.assistantContainer}>
                  {/* 扁平块列表 */}
                  {msg.blocks.map((block, bi) => {
                    switch (block.type) {
                      case "text":
                        return (
                          <div key={bi} className={styles.textBlock}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={mdComponents}
                            >
                              {block.content}
                            </ReactMarkdown>
                          </div>
                        );

                      case "thought":
                        // 思考过程：默认展开，使用 Markdown 渲染
                        return (
                          <Collapse
                            key={bi}
                            ghost
                            size="small"
                            className={styles.thoughtBlock}
                            defaultActiveKey={["thought"]}
                          >
                            <Collapse.Panel
                              key="thought"
                              header={
                                <span className={styles.thoughtHeader}>
                                  思考内容
                                </span>
                              }
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={mdComponents}
                              >
                                {block.lines.join("\n")}
                              </ReactMarkdown>
                            </Collapse.Panel>
                          </Collapse>
                        );

                      case "tool_call":
                        return (
                          <div key={bi} className={styles.toolCallBlock}>
                            <Tag
                              color="default"
                              style={{
                                fontSize: 11,
                                lineHeight: "1.4",
                                padding: "0 6px",
                              }}
                            >
                              {toolLabel(block.tool)}
                            </Tag>
                            <span className={styles.toolCallArgs}>
                              {block.args}
                            </span>
                            {block.result ? (
                              <span className={styles.toolCallResult}>
                                {block.result}
                              </span>
                            ) : (
                              <span className={styles.toolCallRunning}>
                                <Spin size="small" style={{ marginRight: 4 }} />
                                处理中...
                              </span>
                            )}
                          </div>
                        );

                      case "summary":
                        return (
                          <div key={bi} className={styles.summaryBlock}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={mdComponents}
                            >
                              {block.content}
                            </ReactMarkdown>
                          </div>
                        );

                      default:
                        return null;
                    }
                  })}

                  {/* 流式加载指示 — 尚未输出任何内容时 */}
                  {msg.streaming && msg.blocks.length === 0 && (
                    <span
                      style={{
                        color: "#888",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: 8,
                      }}
                    >
                      <Spin size="small" /> 处理中...
                    </span>
                  )}

                  {/* 闪烁光标（有内容正在流式输出时） */}
                  {msg.streaming && msg.blocks.length > 0 && (
                    <span className={styles.streamingCursor}>|</span>
                  )}
                </div>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <Flex
          vertical={false}
          gap={8}
          align="center"
          className={styles.inputArea}
        >
          <Input
            ref={inputRef}
            placeholder={
              agentReady
                ? activeDocId
                  ? "描述文档操作需求..."
                  : "输入消息...（建议先打开文档）"
                : "Agent 未就绪..."
            }
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!agentReady || isLoading}
            variant="filled"
            size="small"
            style={{ flex: 1 }}
          />
          {isLoading ? (
            <Button
              onClick={handleCancel}
              danger
              icon={<StopOutlined />}
              size="small"
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={handleSend}
              disabled={!agentReady || !inputText.trim()}
              icon={<SendOutlined />}
              size="small"
            >
              发送
            </Button>
          )}
        </Flex>
      </div>
    </ConfigProvider>
  );
}
