/**
 * PhaseCard - 阶段卡片渲染
 *
 * 从 AgentPanel.tsx 迁出，职责单一：渲染单个 phase 的 Thought / ToolCall / Todo / Text 内容。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tag } from "antd";
import { Bubble } from "@ant-design/x";
import {
  CheckCircleOutlined,
  LoadingOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import type { MsgBlock, PhaseCard, AssistantMsg } from "./chatTypes";
import ToolCallBlock from "./ToolCallBlock";
import xMarkdownComponents from "./xMarkdown";
import styles from "./AgentPanel.module.css";

interface Props {
  phase: PhaseCard;
  msg: AssistantMsg;
}

export default function PhaseCardView({ phase, msg }: Props) {
  const textBlocks = phase.blocks.filter(
    (b) => b.type === "text" || b.type === "summary"
  );

  return (
    <div className={styles.phaseCard}>
      <div className={styles.phaseCardHeader}>
        <span className={styles.phaseCardIcon}>
          {phase.status === "running" ? (
            <LoadingOutlined spin style={{ color: "#1890ff", fontSize: 14 }} />
          ) : (
            <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 14 }} />
          )}
        </span>
        <span className={styles.phaseCardLabel}>{phase.label}</span>
        <Tag
          color={phase.status === "running" ? "processing" : "success"}
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
            const thought = b as Extract<MsgBlock, { type: "thought" }>;
            return (
              <details key={bi} className={styles.thoughtSection}>
                <summary className={styles.thoughtSummary}>思考内容</summary>
                <div className={styles.thoughtBody}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={xMarkdownComponents}
                  >
                    {thought.lines.join("")}
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
            const todo = b as Extract<MsgBlock, { type: "todo" }>;
            return (
              <div key={bi} className={styles.todoList}>
                {todo.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={[
                      styles.todoItem,
                      task.status === "done" ? styles.todoItemDone : "",
                      task.status === "pending" ? styles.todoItemPending : "",
                    ].join(" ")}
                  >
                    <span className={styles.todoCheck}>
                      {task.status === "done" ? (
                        <CheckCircleOutlined style={{ color: "#52c41a" }} />
                      ) : task.status === "running" ? (
                        <LoadingOutlined spin style={{ color: "#1890ff" }} />
                      ) : (
                        <MinusOutlined style={{ color: "#555" }} />
                      )}
                    </span>
                    <span
                      className={[
                        styles.todoGoal,
                        task.status === "done" ? styles.todoGoalDone : "",
                      ].join(" ")}
                    >
                      {task.goal}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

        {/* 文本 / 总结 */}
        {textBlocks.map((b, bi) => {
          const text = b as Extract<MsgBlock, { type: "text" | "summary" }>;
          const isLast = bi === textBlocks.length - 1;
          return (
            <Bubble
              key={bi}
              placement="start"
              content={text.content}
              className={styles.assistantBubble}
              typing={msg.streaming && isLast ? true : undefined}
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
  );
}
