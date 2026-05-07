/**
 * InlineTool — OpenCode 风格行内工具指示器
 *
 * 格式：→ 工具名 · 参数 · 结果（单行，入场动画）
 */

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

  // 截断过长结果
  const short = result.length > 80 ? result.slice(0, 80) + "..." : result;

  return (
    <div
      className={[
        styles.toolLine,
        done ? styles.toolLineDone : styles.toolLineRunning,
        isError ? styles.toolLineError : "",
      ].join(" ")}
    >
      {!done ? (
        <span className={styles.toolArrow}>→</span>
      ) : isError ? (
        <span className={styles.toolArrowErr}>✗</span>
      ) : (
        <span className={styles.toolArrowOk}>✓</span>
      )}
      <span className={styles.toolLabel}>{tool}</span>
      {args && <span className={styles.toolArg}> · {args}</span>}
      {done && <span className={isError ? styles.toolResultErr : styles.toolResult}> · {short}</span>}
    </div>
  );
}
