/**
 * AgentMessage — OpenCode 风格线性消息渲染
 *
 * 扁平化所有阶段的 blocks，按时间顺序 switch 渲染：
 *   thought  = 半透明小字，前缀 "思考内容"
 *   tool_call = → 前缀 + 入场动画
 *   text/summary = 不透明正文（无 Bubble 包裹）
 *   todo   = sticky 紧凑标签条
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MsgBlock, AssistantMsg } from "./chatTypes";
import InlineTool from "./InlineTool";
import xMarkdownComponents from "./xMarkdown";
import styles from "./AgentPanel.module.css";

interface Props {
  msg: AssistantMsg;
  isLatest: boolean;
}

export default function AgentMessage({ msg, isLatest }: Props) {
  const allBlocks = msg.phases.flatMap((p) => p.blocks);
  // 所有 todo block 的 tasks 聚合为一个扁平数组（统一 strip 渲染）
  const allTodoTasks = allBlocks
    .filter((b) => b.type === "todo")
    .flatMap((b) => (b as Extract<MsgBlock, { type: "todo" }>).tasks);

  return (
    <div className={styles.agentMessage}>
      {/* Todo 条 — 所有任务统一渲染在一个 strip 中 */}
      {allTodoTasks.length > 0 && (
        <div className={msg.streaming ? styles.todoSticky : styles.todoStrip}>
          <span className={styles.todoChips}>
            {allTodoTasks.map((t) => (
              <span
                key={t.id}
                className={[
                  styles.todoChip,
                  t.status === "done" ? styles.todoChipDone : styles.todoChipPending,
                ].join(" ")}
              >
                {t.status === "done" ? "✓" : "○"} {t.goal}
              </span>
            ))}
          </span>
        </div>
      )}

      {/* 线性渲染所有 block — 无 Bubble，纯 Markdown 正文 */}
      {allBlocks.map((block, i) => {
        if (block.type === "thought") {
          const thought = block as Extract<MsgBlock, { type: "thought" }>;
          return (
            <div key={i} className={styles.thoughtLine}>
              <span className={styles.thoughtPrefix}>思考内容</span>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                {thought.lines.join("")}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === "tool_call") {
          const tc = block as Extract<MsgBlock, { type: "tool_call" }>;
          return (
            <InlineTool
              key={i}
              tool={tc.tool}
              args={tc.args}
              result={tc.result}
              success={tc.success}
            />
          );
        }

        if (block.type === "text" || block.type === "summary") {
          const text = block as Extract<MsgBlock, { type: "text" | "summary" }>;
          return (
            <div key={i} className={styles.textBlock}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                {text.content}
              </ReactMarkdown>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
