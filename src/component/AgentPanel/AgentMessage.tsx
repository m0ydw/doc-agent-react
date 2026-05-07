/**
 * AgentMessage - Claude Code 风格线性渲染
 *
 * 将所有阶段的 blocks 按时间顺序扁平化，思考与工具交替展示，无卡片框。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bubble } from "@ant-design/x";
import type { MsgBlock, AssistantMsg } from "./chatTypes";
import InlineTool from "./InlineTool";
import xMarkdownComponents from "./xMarkdown";
import styles from "./AgentPanel.module.css";

interface Props {
  msg: AssistantMsg;
  /** 是否是最后一条消息（控制 streaming typing 动画） */
  isLatest: boolean;
}

export default function AgentMessage({ msg, isLatest }: Props) {
  // 扁平化：所有阶段的所有 blocks 按出现顺序
  const allBlocks: { block: MsgBlock; phaseKey: string; blockIdx: number }[] = [];
  for (const phase of msg.phases) {
    for (let i = 0; i < phase.blocks.length; i++) {
      allBlocks.push({ block: phase.blocks[i], phaseKey: phase.phase + "-" + i, blockIdx: i });
    }
  }

  const textBlocks = allBlocks.filter(
    (b) => b.block.type === "text" || b.block.type === "summary"
  );
  let textBlockIndex = 0;

  return (
    <div className={styles.agentMessage}>
      {allBlocks.map(({ block, phaseKey }, i) => {
        switch (block.type) {
          case "thought": {
            const thought = block as Extract<MsgBlock, { type: "thought" }>;
            return (
              <details key={phaseKey} className={styles.thoughtSection}>
                <summary className={styles.thoughtSummary}>思考</summary>
                <div className={styles.thoughtBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                    {thought.lines.join("")}
                  </ReactMarkdown>
                </div>
              </details>
            );
          }

          case "tool_call": {
            const tc = block as Extract<MsgBlock, { type: "tool_call" }>;
            return (
              <InlineTool
                key={phaseKey}
                tool={tc.tool}
                args={tc.args}
                result={tc.result}
                success={tc.success}
              />
            );
          }

          case "todo": {
            const todo = block as Extract<MsgBlock, { type: "todo" }>;
            return (
              <div key={phaseKey} className={styles.todoStrip}>
                {todo.tasks.map((task) => (
                  <span
                    key={task.id}
                    className={[
                      styles.todoChip,
                      task.status === "done" ? styles.todoChipDone : styles.todoChipPending,
                    ].join(" ")}
                  >
                    {task.status === "done" ? "✓" : "○"} {task.goal}
                  </span>
                ))}
              </div>
            );
          }

          case "text":
          case "summary": {
            const text = block as Extract<MsgBlock, { type: "text" | "summary" }>;
            const isLastText = textBlockIndex === textBlocks.length - 1;
            textBlockIndex++;
            return (
              <Bubble
                key={phaseKey}
                placement="start"
                content={text.content}
                className={styles.assistantBubble}
                typing={msg.streaming && isLatest && isLastText ? true : undefined}
                contentRender={(content: string) => (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={xMarkdownComponents}>
                    {content}
                  </ReactMarkdown>
                )}
              />
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}
