/**
 * Agent 对话面板 — @ant-design/x 现代化改造
 *
 * 渲染：Bubble（气泡）+ ThoughtChain（思考链）+ Sender（输入）+ ToolCallBlock（工具）
 * 流式：content 累积到同一 text block，ReactMarkdown 完整渲染
 * 暗色主题：ConfigProvider darkAlgorithm
 */

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Tooltip, Flex, ConfigProvider, theme } from "antd";
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
// 扁平块类型
// ================================================================

type MsgBlock =
  | { type: "text"; content: string }
  | { type: "thought"; lines: string[] }
  | { type: "tool_call"; tool: string; args: string; result: string; success?: boolean }
  | { type: "summary"; content: string }
  | { type: "todo"; tasks: Array<{ id: string; goal: string; status: string }> };

interface AssistantMsg {
  role: "assistant";
  blocks: MsgBlock[];
  streaming: boolean;
}

type Message = { role: "user"; content: string } | AssistantMsg;

interface BuildState {
  blocks: MsgBlock[];
  currentThought: string[] | null;
  activePhase: string | null;
}

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
    blocks: [],
    currentThought: null,
    activePhase: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 快照提交
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
        updated[updated.length - 1] = { ...last, blocks: snapshot };
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
          state.activePhase = event.phase;
          commitRender();
          break;
        }
        case "phase_end": {
          if (state.activePhase === event.phase) state.activePhase = null;
          commitRender();
          break;
        }
        case "phase_status": {
          // 阶段状态文本（如"正在分析您的需求..."），前端无需渲染
          break;
        }
        case "thought": {
          if (!state.currentThought) {
            state.currentThought = [];
            state.blocks.push({ type: "thought", lines: state.currentThought });
          }
          state.currentThought.push(event.content);
          commitRender();
          break;
        }
        case "content": {
          state.currentThought = null;
          const lastBlock = state.blocks[state.blocks.length - 1];
          if (lastBlock && lastBlock.type === "text") {
            (lastBlock as Extract<MsgBlock, { type: "text" }>).content +=
              event.content;
          } else {
            state.blocks.push({ type: "text", content: event.content });
          }
          commitRender();
          break;
        }
        case "chat_content": {
          state.currentThought = null;
          const lastBlock = state.blocks[state.blocks.length - 1];
          if (lastBlock && lastBlock.type === "text") {
            (lastBlock as Extract<MsgBlock, { type: "text" }>).content +=
              event.content;
          } else {
            state.blocks.push({ type: "text", content: event.content });
          }
          commitRender();
          break;
        }
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
        case "tool_call": {
          state.currentThought = null;
          const last = state.blocks[state.blocks.length - 1];
          if (
            last &&
            last.type === "tool_call" &&
            last.tool === event.tool &&
            last.result === ""
          )
            break;
          state.blocks.push({
            type: "tool_call",
            tool: event.tool,
            args: event.args,
            result: "",
          });
          commitRender();
          break;
        }
        case "tool_result": {
          for (let i = state.blocks.length - 1; i >= 0; i--) {
            const b = state.blocks[i];
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
          state.blocks.push({
            type: "text",
            content: `目标文档：${event.fileName}`,
          });
          commitRender();
          break;
        }
        case "summary": {
          state.currentThought = null;
          state.activePhase = null;
          const detail = event.detail ? `\n\n${event.detail}` : "";
          const failed =
            event.failed_tasks.length > 0
              ? `\n\n失败：${event.failed_tasks.join("、")}`
              : "";
          state.blocks.push({
            type: "summary",
            content: `${event.summary_text}${detail}${failed}`,
          });
          commitRender();
          setIsLoading(false);
          break;
        }
        case "todo_list": {
          // 标准 #9：事件驱动 Todo 状态，替代中文关键词推断
          state.currentThought = null;
          const tasks = event.tasks.map((t) => ({
            id: t.id,
            goal: t.goal,
            status: "pending" as const,
          }));
          state.blocks.push({ type: "todo", tasks });
          commitRender();
          break;
        }
        case "todo_done": {
          // 标准 #9：更新对应任务的 status 为 done
          for (let i = state.blocks.length - 1; i >= 0; i--) {
            const b = state.blocks[i];
            if (b.type === "todo") {
              const todoBlock = b as Extract<MsgBlock, { type: "todo" }>;
              const task = todoBlock.tasks.find((t) => t.id === event.id);
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
        blocks: [],
        currentThought: null,
        activePhase: null,
      };
      setMessages((prev) => [...prev, { role: "user", content: msg }]);
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, blocks: [], streaming: true },
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
    abortRef.current?.abort();
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
                  {/* 思考过程（Markdown 渲染） */}
                  {msg.blocks
                    .filter((b) => b.type === "thought")
                    .map((b, bi) => {
                      const thought = b as Extract<MsgBlock, { type: "thought" }>;
                      const mdContent = thought.lines.join("\n\n");
                      return (
                        <details key={bi} className={styles.thoughtSection}>
                          <summary className={styles.thoughtSummary}>思考内容</summary>
                          <div className={styles.thoughtBody}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={xMarkdownComponents}
                            >
                              {mdContent}
                            </ReactMarkdown>
                          </div>
                        </details>
                      );
                    })}

                  {/* 工具调用 */}
                  {msg.blocks
                    .filter((b) => b.type === "tool_call")
                    .map((b, bi) => {
                      const tc = b as Extract<MsgBlock, { type: "tool_call" }>;
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

                  {/* Todo 列表（事件驱动状态，标准 #9） */}
                  {msg.blocks
                    .filter((b) => b.type === "todo")
                    .map((b, bi) => {
                      const todo = b as Extract<MsgBlock, { type: "todo" }>;
                      return (
                        <div key={bi} className={styles.todoList}>
                          {todo.tasks.map((task) => (
                            <div
                              key={task.id}
                              className={`${styles.todoItem} ${
                                task.status === "done" ? styles.todoItemDone :
                                task.status === "pending" ? styles.todoItemPending : ""
                              }`}
                            >
                              <span className={styles.todoCheck}>
                                {task.status === "done"
                                  ? <CheckCircleOutlined style={{ color: "#52c41a" }} />
                                  : task.status === "running"
                                  ? <LoadingOutlined spin style={{ color: "#1890ff" }} />
                                  : <MinusOutlined style={{ color: "#555" }} />}
                              </span>
                              <span className={`${styles.todoGoal} ${task.status === "done" ? styles.todoGoalDone : ""}`}>
                                {task.goal}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}

                  {/* 文本内容 / 总结 */}
                  {msg.blocks
                    .filter((b) => b.type === "text" || b.type === "summary")
                    .map((b, bi) => {
                      const text = b as Extract<
                        MsgBlock,
                        { type: "text" | "summary" }
                      >;
                      const isLastText =
                        bi ===
                        msg.blocks.filter(
                          (b) => b.type === "text" || b.type === "summary"
                        ).length -
                          1;
                      return (
                        <Bubble
                          key={bi}
                          placement="start"
                          content={text.content}
                          className={styles.assistantBubble}
                          typing={
                            msg.streaming && isLastText ? true : undefined
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

                  {/* 空状态 loading */}
                  {msg.streaming && msg.blocks.length === 0 && (
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
