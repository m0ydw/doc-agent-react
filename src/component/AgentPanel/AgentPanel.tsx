/**
 * Agent 对话面板 — antd 组件化版本
 *
 * 功能：
 * - 结构化事件驱动渲染（phase/thought/content/tool/summary）
 * - antd Collapse 展示各阶段，思考过程可折叠
 * - antd Tag 展示工具调用
 * - antd Result 展示最终总结
 * - 流式输出支持
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Collapse, Tag, Result, Spin, Button, Tooltip, Input, Typography, Flex, Card, ConfigProvider, theme } from "antd";
import type { InputRef } from "antd";
import {
  RobotOutlined,
  UserOutlined,
  RightOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
} from "@ant-design/icons";

// Agent 面板暗色主题
const agentTheme: Parameters<typeof ConfigProvider>[0]['theme'] = {
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
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import type { AgentEvent, SummaryEvent } from "@/api/aiApi";
import styles from "./AgentPanel.module.css";

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeDocId?: string | null;
}

// ================================================================
// 阶段数据结构
// ================================================================

interface PhaseData {
  name: string;
  label: string;
  thoughtLines: string[];
  contentLines: string[];
  tools: { tool: string; args: string; result: string }[];
  status: "active" | "completed" | "failed";
}

const PHASE_LABELS: Record<string, string> = {
  analyze: "分析需求",
  plan: "制定计划",
  execute: "执行操作",
  validate: "验证结果",
};

const PHASE_ICONS: Record<string, string> = {
  analyze: "🔍",
  plan: "📋",
  execute: "⚡",
  validate: "✅",
};

// 工具名 → antd Tag 颜色映射
const TOOL_COLORS: Record<string, string> = {
  sdk_get_text: "blue",
  sdk_find_text: "cyan",
  sdk_replace_text: "orange",
  sdk_replace_all: "volcano",
  sdk_save: "green",
};

function toolColor(tool: string): string {
  return TOOL_COLORS[tool] || "default";
}

function toolLabel(tool: string): string {
  const map: Record<string, string> = {
    sdk_get_text: "读取全文",
    sdk_find_text: "查找文本",
    sdk_replace_text: "替换文本",
    sdk_replace_all: "全部替换",
    sdk_save: "保存文档",
  };
  return map[tool] || tool;
}

// ================================================================
// 组件
// ================================================================

export default function AgentPanel({ collapsed, onToggleCollapse, activeDocId }: AgentPanelProps) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ memory: number; docs: number } | null>(null);

  // 消息列表：用户消息 → Agent 响应（含多个 phase + summary）
  const [messages, setMessages] = useState<
    Array<
      | { role: "user"; content: string }
      | {
          role: "assistant";
          phases: PhaseData[];
          summary: SummaryEvent | null;
          streaming: boolean;
        }
    >
  >([]);

  // 当前正在构建的 assistant 消息（流式写入）
  const currentAssistantRef = useRef<{
    phases: PhaseData[];
    currentPhase: PhaseData | null;
    summary: SummaryEvent | null;
  }>({ phases: [], currentPhase: null, summary: null });

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);

  // 启动时检查 Agent 状态
  useEffect(() => { checkAgentStatus(); }, []);

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
      setAgentStatus({ memory: status.memoryEntries, docs: status.availableDocs });
    }
  };

  // ================================================================
  // 事件处理
  // ================================================================

  const handleEvent = useCallback((event: AgentEvent) => {
    const state = currentAssistantRef.current;

    switch (event.type) {
      // 阶段开始 — 创建新阶段
      case "phase_start": {
        const newPhase: PhaseData = {
          name: event.phase,
          label: PHASE_LABELS[event.phase] || event.phase,
          thoughtLines: [],
          contentLines: [],
          tools: [],
          status: "active",
        };
        state.currentPhase = newPhase;
        state.phases.push(newPhase);
        // 触发重渲染
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              phases: [...state.phases],
            };
          }
          return updated;
        });
        break;
      }

      // 阶段结束
      case "phase_end": {
        if (state.currentPhase && state.currentPhase.name === event.phase) {
          state.currentPhase.status = "completed";
          state.currentPhase = null;
        }
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              phases: [...state.phases],
            };
          }
          return updated;
        });
        break;
      }

      // 思考过程
      case "thought": {
        if (state.currentPhase) {
          state.currentPhase.thoughtLines.push(event.content);
          triggerRender(state, setMessages);
        }
        break;
      }

      // 用户可见内容
      case "content": {
        if (state.currentPhase) {
          state.currentPhase.contentLines.push(event.content);
          triggerRender(state, setMessages);
        }
        break;
      }

      // 工具调用
      case "tool_call": {
        if (state.currentPhase) {
          state.currentPhase.tools.push({
            tool: event.tool,
            args: event.args,
            result: "",
          });
          triggerRender(state, setMessages);
        }
        break;
      }

      // 工具执行结果
      case "tool_result": {
        if (state.currentPhase && state.currentPhase.tools.length > 0) {
          const lastTool = state.currentPhase.tools[state.currentPhase.tools.length - 1];
          lastTool.result = event.content;
          triggerRender(state, setMessages);
        }
        break;
      }

      // 总结
      case "summary": {
        state.summary = event;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              summary: event,
              streaming: false,
            };
          }
          return updated;
        });
        setIsLoading(false);
        break;
      }

      // 错误
      case "error": {
        setIsLoading(false);
        break;
      }
    }
  }, []);

  const handleDone = useCallback(() => {
    setIsLoading(false);
    checkAgentStatus();
  }, []);

  const handleError = useCallback((_error: string) => {
    setIsLoading(false);
  }, []);

  // ================================================================
  // 发送 / 取消 / 重置
  // ================================================================

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    setIsLoading(true);

    // 重置当前 assistant 构建器
    currentAssistantRef.current = { phases: [], currentPhase: null, summary: null };

    // 添加用户消息
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    // 添加占位的 assistant 消息
    setMessages((prev) => [
      ...prev,
      { role: "assistant" as const, phases: [], summary: null, streaming: true },
    ]);

    abortRef.current = sendAgentMessage(
      text,
      activeDocId ?? undefined,
      handleEvent,
      handleDone,
      handleError
    );
  }, [inputText, isLoading, activeDocId, handleEvent, handleDone, handleError]);

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
      <div className={styles.collapsedPanel} onClick={onToggleCollapse} title="展开 Agent 面板">
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
        <Typography.Text strong style={{ color: "#fff", fontSize: 14 }}>
          <RobotOutlined style={{ marginRight: 6 }} />
          Agent
          {agentStatus && (
            <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              {agentStatus.docs} 文档
            </Typography.Text>
          )}
        </Typography.Text>
        <Flex gap={6} align="center">
          <Tooltip title="重置对话">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleReset}
              disabled={isLoading}
            />
          </Tooltip>
          <Button size="small" onClick={onToggleCollapse} icon={<RightOutlined />} />
        </Flex>
      </Flex>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <Flex vertical align="center" justify="center" style={{ height: "100%", color: "#666", textAlign: "center", gap: 8 }}>
            <RobotOutlined style={{ fontSize: 32, opacity: 0.3 }} />
            <Typography.Text type="secondary">向 AI Agent 描述你的文档操作需求</Typography.Text>
            {!activeDocId && (
              <Typography.Text style={{ fontSize: 11, color: "#555" }}>
                提示：打开一个文档后 Agent 可以自动识别
              </Typography.Text>
            )}
            {!agentReady && (
              <Typography.Text style={{ fontSize: 11, color: "#cc4444" }}>
                Agent 未初始化，请检查 API Key 配置
              </Typography.Text>
            )}
          </Flex>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              <div className={styles.userMessageRow}>
                <div className={styles.userBubble}>{msg.content}</div>
                <UserOutlined className={styles.userIcon} />
              </div>
            ) : (
              <div className={styles.assistantResponse}>
                {/* Phase: 分析 / 计划 / 执行 / 验证 */}
                {msg.phases.map((phase) => (
                  <Collapse
                    key={phase.name}
                    ghost
                    size="small"
                    defaultActiveKey={["phase-" + phase.name]}
                    className={styles.phaseCollapse}
                  >
                    <Collapse.Panel
                      key={"phase-" + phase.name}
                      header={
                        <span className={styles.phaseHeader}>
                          <span className={styles.phaseIcon}>{PHASE_ICONS[phase.name]}</span>
                          <span className={styles.phaseLabel}>{phase.label}</span>
                          {phase.status === "active" && <Spin size="small" style={{ marginLeft: 8 }} />}
                        </span>
                      }
                    >
                      {/* 思考过程（可折叠） */}
                      {phase.thoughtLines.length > 0 && (
                        <Collapse ghost size="small" className={styles.thoughtCollapse}>
                          <Collapse.Panel
                            key="thought"
                            header={<span className={styles.thoughtHeader}>💭 思考过程</span>}
                          >
                            <Typography.Paragraph
                              style={{
                                fontSize: 12,
                                color: "#aaa",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                margin: 0,
                                padding: "6px 8px",
                                background: "#1a1a2e",
                                borderRadius: 4,
                                maxHeight: 200,
                                overflow: "auto",
                                lineHeight: 1.6,
                              }}
                            >
                              {phase.thoughtLines.join("\n")}
                            </Typography.Paragraph>
                          </Collapse.Panel>
                        </Collapse>
                      )}

                      {/* 用户可见内容 */}
                      {phase.contentLines.length > 0 && (
                        <div className={styles.phaseContent}>
                          {phase.contentLines.map((line, ci) => (
                            <Typography.Paragraph key={ci} style={{ marginBottom: 4, color: "#ddd", fontSize: 13 }}>
                              {line}
                            </Typography.Paragraph>
                          ))}
                        </div>
                      )}

                      {/* 工具调用链 */}
                      {phase.tools.length > 0 && (
                        <div className={styles.toolChain}>
                          {phase.tools.map((t, ti) => (
                            <span key={ti} className={styles.toolItem}>
                              <Tag color={toolColor(t.tool)} className={styles.toolTag}>
                                {toolLabel(t.tool)}
                              </Tag>
                              <span className={styles.toolResult}>
                                {t.result || "⏳"}
                              </span>
                              {ti < phase.tools.length - 1 && (
                                <span className={styles.toolArrow}>→</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </Collapse.Panel>
                  </Collapse>
                ))}

                {/* 流式加载中 */}
                {msg.streaming && msg.phases.length === 0 && !msg.summary && (
                  <Typography.Text type="secondary" style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, fontSize: 12 }}>
                    <Spin size="small" /> 思考中...
                  </Typography.Text>
                )}

                {/* Summary 总结卡片 */}
                {msg.summary && (
                  <Card size="small" className={styles.summaryCard} bordered={false}>
                    <Result
                      status={
                        msg.summary.result === "success"
                          ? "success"
                          : msg.summary.result === "intervention"
                          ? "warning"
                          : "error"
                      }
                      title={msg.summary.summary_text}
                      subTitle={msg.summary.detail}
                      extra={
                        msg.summary.failed_tasks.length > 0 && (
                          <div className={styles.failedTasks}>
                            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>
                              失败任务：
                            </Typography.Text>
                            {msg.summary.failed_tasks.map((t, fi) => (
                              <Tag key={fi} color="red">{t}</Tag>
                            ))}
                          </div>
                        )
                      }
                    />
                  </Card>
                )}
              </div>
            )}
          </div>
        ))}

        {/* 空消息占位 + 自动滚动 */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <Flex vertical={false} gap={8} align="center" className={styles.inputArea}>
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
          <Button onClick={handleCancel} danger icon={<StopOutlined />} size="small">
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

// ================================================================
// 辅助函数：触发 React 重渲染
// ================================================================

function triggerRender(
  state: { phases: PhaseData[] },
  setMessages: React.Dispatch<React.SetStateAction<any[]>>
) {
  setMessages((prev) => {
    const updated = [...prev];
    const last = updated[updated.length - 1];
    if (last && last.role === "assistant") {
      updated[updated.length - 1] = {
        ...last,
        phases: [...state.phases],
      };
    }
    return updated;
  });
}
