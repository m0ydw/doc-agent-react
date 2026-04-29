/**
 * ================================================================
 * ToolCallBlock — 工具调用展示组件
 * ================================================================
 * 执行中：显示工具名 + 参数 + 旋转 spinner
 * 完成后：显示工具名 + 结果 + 淡入 check 图标
 */

import { Tag, Typography } from "antd";
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import styles from "./AgentPanel.module.css";

interface ToolCallBlockProps {
  /** 内部工具名（如 sdk_find_text） */
  tool: string;
  /** 自然语言参数描述（如 搜索 "公司"） */
  args: string;
  /** 结果描述（空 = 执行中） */
  result: string;
}

/** 工具名 → 自然语言标签 */
const TOOL_LABELS: Record<string, string> = {
  sdk_get_text: "读取文档",
  sdk_find_text: "搜索文本",
  sdk_replace_text: "替换文本",
  sdk_replace_all: "批量替换",
  sdk_save: "保存更改",
};

export default function ToolCallBlock({ tool, args, result }: ToolCallBlockProps) {
  const done = !!result;
  const label = TOOL_LABELS[tool] || tool;
  const isError = result && (result.startsWith("✗") || result.includes("失败") || result.includes("错误"));

  return (
    <div className={`${styles.toolBlock} ${done ? styles.toolBlockDone : styles.toolBlockRunning}`}>
      {/* Header */}
      <div className={styles.toolHeader}>
        {!done ? (
          <LoadingOutlined spin style={{ color: "#1890ff", fontSize: 14, marginRight: 6 }} />
        ) : isError ? (
          <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: 14, marginRight: 6 }} />
        ) : (
          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 14, marginRight: 6 }} />
        )}
        <span className={styles.toolStatus}>
          {!done ? "执行中" : isError ? "失败" : "已完成"}
        </span>
        <Tag
          color={done ? (isError ? "error" : "success") : "processing"}
          style={{ fontSize: 11, marginLeft: 8, lineHeight: "18px" }}
        >
          {label}
        </Tag>
      </div>

      {/* Args */}
      {args && (
        <Typography.Text type="secondary" className={styles.toolArgs}>
          {args}
        </Typography.Text>
      )}

      {/* Result */}
      {done && (
        <div className={`${styles.toolResult} ${isError ? styles.toolResultError : ""}`}>
          {result}
        </div>
      )}
    </div>
  );
}
