/**
 * Agent 对话面板
 *
 * 功能：
 * - 与后端 AI Agent 对话
 * - SSE 流式输出 AI 回复
 * - 支持重置对话记忆
 * - 自动关联当前文档（activeDocId）
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { sendAgentMessage, resetAgent, getAgentStatus } from "@/api/aiApi";
import styles from "./AgentPanel.module.css";

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** 当前激活的文档 ID（由 AppLayout 传入） */
  activeDocId?: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** 是否正在流式输出中 */
  streaming?: boolean;
}

export default function AgentPanel({ collapsed, onToggleCollapse, activeDocId }: AgentPanelProps) {
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agentReady, setAgentReady] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ memory: number; docs: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 启动时检查 Agent 状态
  useEffect(() => {
    checkAgentStatus();
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 聚焦输入框
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

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    setInputText("");
    setIsLoading(true);

    // 添加用户消息
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    // 添加占位的 AI 回复（流式输出中）
    const aiMessageId = Date.now();
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true },
    ]);

    // 发送请求
    abortRef.current = sendAgentMessage(
      text,
      activeDocId ?? undefined,
      // onChunk：追加内容到最后一条 AI 消息
      (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
          }
          return updated;
        });
      },
      // onDone：标记流式结束
      () => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              streaming: false,
            };
          }
          return updated;
        });
        setIsLoading(false);
        checkAgentStatus();
      },
      // onError
      (error) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + `\n\n[错误] ${error}`,
              streaming: false,
            };
          } else {
            updated.push({
              role: "assistant",
              content: `[错误] ${error}`,
              streaming: false,
            });
          }
          return updated;
        });
        setIsLoading(false);
      }
    );
  }, [inputText, isLoading, activeDocId]);

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

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        updated[updated.length - 1] = { ...last, streaming: false };
      }
      return updated;
    });
  }, []);

  // ===== 折叠状态 =====
  if (collapsed) {
    return (
      <div className={styles.collapsedPanel} onClick={onToggleCollapse} title="展开 Agent 面板">
        <span className={styles.expandBtn}>Agent</span>
      </div>
    );
  }

  // ===== 展开状态 =====
  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          Agent
          {agentStatus && (
            <span className={styles.statusBadge}>
              {agentStatus.docs} 文档 / {agentStatus.memory} 记忆
            </span>
          )}
        </span>
        <div className={styles.headerActions}>
          <button
            className={styles.resetBtn}
            onClick={handleReset}
            title="重置对话记忆"
            disabled={isLoading}
          >
            ↺ 重置
          </button>
          <button className={styles.collapseBtn} onClick={onToggleCollapse} title="折叠面板">
            ▶
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🤖</div>
            <div>向 AI Agent 描述你的文档操作需求</div>
            {activeDocId && (
              <div className={styles.docHint}>当前文档已关联，Agent 可直接操作</div>
            )}
            {!activeDocId && (
              <div className={styles.docHint}>提示：打开一个文档后 Agent 可以自动识别</div>
            )}
            {!agentReady && (
              <div className={styles.errorHint}>Agent 未初始化，请检查 API Key 配置</div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${
              msg.role === "user" ? styles.messageUser : styles.messageAssistant
            }`}
          >
            <div
              className={`${styles.messageBubble} ${
                msg.role === "user"
                  ? styles.messageBubbleUser
                  : styles.messageBubbleAssistant
              }`}
            >
              {msg.content || (msg.streaming ? "..." : "")}
              {/* 流式输出光标 */}
              {msg.streaming && <span className={styles.cursor}>▍</span>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
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
          />
          {isLoading ? (
            <button className={styles.sendBtn} onClick={handleCancel}>
              停止
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!agentReady || !inputText.trim()}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
