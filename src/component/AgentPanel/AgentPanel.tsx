import { useState } from "react";
import styles from "./AgentPanel.module.css";

interface AgentPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function AgentPanel({ collapsed, onToggleCollapse }: AgentPanelProps) {
  const [inputText, setInputText] = useState("");

  if (collapsed) {
    return (
      <div className={styles.collapsedPanel} onClick={onToggleCollapse} title="展开 Agent 面板">
        <span className={styles.expandBtn}>Agent</span>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Agent</span>
        <div className={styles.headerActions}>
          <button className={styles.collapseBtn} onClick={onToggleCollapse} title="折叠面板">
            ▶
          </button>
        </div>
      </div>

      <div className={styles.messages}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🤖</div>
          <div>Agent 功能开发中</div>
          {/* TODO: remove placeholder when agent is implemented */}
        </div>
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
            className={styles.input}
            type="text"
            placeholder="输入消息..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled
          />
          <button className={styles.sendBtn} disabled>
            发送
          </button>
        </div>
        {/* TODO: enable input + send when agent is implemented */}
      </div>
    </div>
  );
}
