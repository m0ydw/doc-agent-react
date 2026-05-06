/**
 * AssistantCard — 统一助手卡片（@deprecated AgentPanel 已内联渲染 blocks）
 *
 * 保留此组件供未来可能的独立使用场景。
 * Todo 状态已改为事件驱动（task.status），不再用中文关键词推断。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tag } from "antd";
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusOutlined } from "@ant-design/icons";
import xMarkdownComponents from "./xMarkdown";
import styles from "./AgentPanel.module.css";

// ================================================================
// 类型
// ================================================================

interface ThoughtBlock { type: "thought"; lines: string[] }
interface TextBlock { type: "text" | "summary"; content: string }
interface ToolBlock { type: "tool_call"; tool: string; args: string; result: string }
interface TodoTaskBlock { type: "todo"; tasks: Array<{ id: string; goal: string; status: string }> }
type MsgBlock = ThoughtBlock | TextBlock | ToolBlock | TodoTaskBlock;

interface AssistantCardProps {
  blocks: MsgBlock[];
  streaming: boolean;
}

// ================================================================
// 子组件：可折叠思考
// ================================================================

function CollapsibleThought({ lines }: { lines: string[] }) {
  const mdContent = lines.join("\n\n");
  return (
    <details className={styles.thoughtSection}>
      <summary className={styles.thoughtSummary}>思考内容</summary>
      <div className={styles.thoughtBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
          {mdContent}
        </ReactMarkdown>
      </div>
    </details>
  );
}

// ================================================================
// 子组件：内容（独立 Markdown）
// ================================================================

function PhaseContent({ content }: { content: string }) {
  if (!content.trim()) return null;
  return (
    <div className={styles.phaseContent}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ================================================================
// 子组件：内联工具
// ================================================================

function ToolCallInline({ tool, args, result }: ToolBlock) {
  const done = !!result;
  const label = tool; // SSE 事件中 tool 已是 displayName（后端已格式化）
  const isError = done && (result.startsWith("✗") || result.includes("失败") || result.includes("错误"));

  return (
    <div className={`${styles.toolInline} ${done ? styles.toolInlineDone : styles.toolInlineRunning}`}>
      <div className={styles.toolInlineRow}>
        {!done ? <LoadingOutlined spin className={styles.toolInlineIcon} style={{ color: "#1890ff" }} />
          : isError ? <CloseCircleOutlined className={styles.toolInlineIcon} style={{ color: "#ff4d4f" }} />
          : <CheckCircleOutlined className={styles.toolInlineIcon} style={{ color: "#52c41a" }} />}
        <Tag color={done ? (isError ? "error" : "success") : "processing"} style={{ fontSize: 11, margin: 0 }}>{label}</Tag>
        {args && <span className={styles.toolInlineArgs}>{args}</span>}
      </div>
      {done && <div className={`${styles.toolInlineResult} ${isError ? styles.toolInlineResultError : ""}`}>{result}</div>}
    </div>
  );
}

// ================================================================
// 子组件：Todo 列表（事件驱动状态，不再用中文关键词推断）
// ================================================================

function TodoList({ tasks }: { tasks: Array<{ id: string; goal: string; status: string }> }) {
  return (
    <div className={styles.todoList}>
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`${styles.todoItem} ${
            task.status === "done" ? styles.todoItemDone :
            task.status === "pending" ? styles.todoItemPending : ""
          }`}
        >
          <span className={styles.todoCheck}>
            {task.status === "done" ? <CheckCircleOutlined style={{ color: "#52c41a" }} />
              : task.status === "running" ? <LoadingOutlined spin style={{ color: "#1890ff" }} />
              : <MinusOutlined style={{ color: "#555" }} />}
          </span>
          <span className={`${styles.todoGoal} ${task.status === "done" ? styles.todoGoalDone : ""}`}>
            {task.goal}
          </span>
        </div>
      ))}
    </div>
  );
}

// ================================================================
// 主组件
// ================================================================

export default function AssistantCard({ blocks, streaming }: AssistantCardProps) {
  if (blocks.length === 0) {
    return streaming ? <div className={styles.card}><div className={styles.cardLoading}>分析中...</div></div> : null;
  }

  return (
    <div className={`${styles.card} ${streaming ? styles.cardStreaming : ""}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "thought":
            return <CollapsibleThought key={i} lines={b.lines} />;
          case "text":
          case "summary":
            return <PhaseContent key={i} content={b.content} />;
          case "tool_call":
            return <ToolCallInline key={i} {...b} />;
          case "todo":
            return <TodoList key={i} tasks={b.tasks} />;
          default:
            return null;
        }
      })}
      {streaming && blocks.length === 0 && <div className={styles.cardLoading}>处理中...</div>}
    </div>
  );
}
