/**
 * ToolCallBlock — 工具调用展示块
 *
 * 根据工具执行状态展示对应图标和结果
 */

import { Tag } from "antd";
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import styles from "./AgentPanel.module.css";

// ================================================================
// Props
// ================================================================

export interface ToolCallBlockProps {
  tool: string;
  args: string;
  result: string;
}

// ================================================================
// 组件
// ================================================================

export default function ToolCallBlock({ tool, args, result }: ToolCallBlockProps) {
  const done = !!result;
  const label = tool; // tool 字段已是 displayName（后端已通过 SDK_TOOL_METADATA 格式化）
  const isError =
    done &&
    (result.startsWith("✗") ||
      result.includes("失败") ||
      result.includes("错误"));

  return (
    <div
      className={`${styles.toolInline} ${done ? styles.toolInlineDone : styles.toolInlineRunning}`}
    >
      <div className={styles.toolInlineRow}>
        {!done ? (
          <LoadingOutlined
            spin
            className={styles.toolInlineIcon}
            style={{ color: "#1890ff" }}
          />
        ) : isError ? (
          <CloseCircleOutlined
            className={styles.toolInlineIcon}
            style={{ color: "#ff4d4f" }}
          />
        ) : (
          <CheckCircleOutlined
            className={styles.toolInlineIcon}
            style={{ color: "#52c41a" }}
          />
        )}
        <Tag
          color={done ? (isError ? "error" : "success") : "processing"}
          style={{ fontSize: 11, margin: 0 }}
        >
          {label}
        </Tag>
        {args && <span className={styles.toolInlineArgs}>{args}</span>}
      </div>
      {done && (
        <div
          className={`${styles.toolInlineResult} ${isError ? styles.toolInlineResultError : ""}`}
        >
          {result}
        </div>
      )}
    </div>
  );
}
