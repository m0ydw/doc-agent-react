/**
 * InlineTool - Claude Code 风格紧凑行内工具指示器
 *
 * 单行展示（图标 + 工具名 + 参数 + 结果），无卡片框/背景。
 */

import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import styles from "./AgentPanel.module.css";

interface Props {
  tool: string;
  args: string;
  result: string;
  success?: boolean;
}

export default function InlineTool({ tool, args, result, success }: Props) {
  const done = !!result;
  const isError = done && success === false;

  return (
    <div className={[styles.inlineTool, done ? styles.inlineToolDone : styles.inlineToolRunning].join(" ")}>
      {!done ? (
        <LoadingOutlined spin style={{ color: "#1890ff", fontSize: 12, marginRight: 4 }} />
      ) : isError ? (
        <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: 12, marginRight: 4 }} />
      ) : (
        <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 12, marginRight: 4 }} />
      )}
      <span className={styles.inlineToolLabel}>{tool}</span>
      {args && <span className={styles.inlineToolArgs}>{args}</span>}
      {done && (
        <span className={styles.inlineToolResult}>
          {" "}
          ·{" "}
          {success === false ? (
            <span style={{ color: "#ff4d4f" }}>{result}</span>
          ) : (
            result.length > 60 ? result.slice(0, 60) + "..." : result
          )}
        </span>
      )}
    </div>
  );
}
