/**
 * AssistantCard — 统一助手卡片
 *
 * 按原始顺序渲染 blocks：思考 → 内容 → 工具 → 思考 → 内容... 自然穿插
 * Todo 列表随工具执行实时更新状态
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
interface TodoTaskBlock { type: "todo"; tasks: Array<{ id: string; goal: string }> }
type MsgBlock = ThoughtBlock | TextBlock | ToolBlock | TodoTaskBlock;

interface AssistantCardProps {
  blocks: MsgBlock[];
  streaming: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  sdk_get_text: "读取文档", sdk_find_text: "搜索文本",
  sdk_replace_text: "替换文本", sdk_replace_all: "批量替换", sdk_save: "保存更改",
};

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
  const label = TOOL_LABELS[tool] || tool;
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
// 子组件：Todo 列表
// ================================================================

function TodoList({ tasks, toolBlocks }: { tasks: Array<{ id: string; goal: string }>; toolBlocks: ToolBlock[] }) {
  const doneTools = toolBlocks.filter(t => t.result && !t.result.startsWith("✗"));
  const runningTool = toolBlocks.filter(t => !t.result).length > 0;

  const getStatus = (task: { id: string; goal: string }) => {
    const goal = task.goal;
    // 保存工具完成 → 保存任务完成
    if (doneTools.some(t => t.tool === "sdk_save")) return "done";
    // 替换完成
    if (doneTools.some(t => (t.tool.includes("replace") && (goal.includes("替换") || goal.includes("修改") || goal.includes("修"))))) return "done";
    // 查找完成
    if (doneTools.some(t => (t.tool.includes("find") && (goal.includes("查找") || goal.includes("搜索") || goal.includes("定位"))))) return "done";
    // 读取完成
    if (doneTools.some(t => t.tool === "sdk_get_text" && goal.includes("读取"))) return "done";
    // 运行中
    if (runningTool && !doneTools.length && goal.includes("查找")) return "running";
    if (runningTool && doneTools.some(t => t.tool.includes("find")) && !doneTools.some(t => t.tool.includes("replace")) && goal.includes("替换")) return "running";
    // 兜底：有工具运行中 → 下一个可能是此任务
    if (runningTool) {
      const doneCount = doneTools.length;
      const taskIndex = tasks.findIndex(t => t.id === task.id);
      if (taskIndex === doneCount) return "running";
      if (taskIndex < doneCount) return "done";
    }
    return "pending";
  };

  return (
    <div className={styles.todoList}>
      {tasks.map(task => {
        const status = getStatus(task);
        return (
          <div key={task.id} className={`${styles.todoItem} ${styles[`todoItem${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
            <span className={styles.todoCheck}>
              {status === "done" ? <CheckCircleOutlined style={{ color: "#52c41a" }} />
                : status === "running" ? <LoadingOutlined spin style={{ color: "#1890ff" }} />
                : <MinusOutlined style={{ color: "#555" }} />}
            </span>
            <span className={`${styles.todoGoal} ${status === "done" ? styles.todoGoalDone : ""}`}>{task.goal}</span>
          </div>
        );
      })}
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

  // 提取工具块用于 todo 状态计算
  const toolBlocks = blocks.filter(b => b.type === "tool_call") as ToolBlock[];

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
            return <TodoList key={i} tasks={b.tasks} toolBlocks={toolBlocks} />;
          default:
            return null;
        }
      })}
      {streaming && blocks.length === 0 && <div className={styles.cardLoading}>处理中...</div>}
    </div>
  );
}
