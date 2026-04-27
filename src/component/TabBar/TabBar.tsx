import styles from "./TabBar.module.css";

export interface TabItem {
  id: string;
  name: string;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}: TabBarProps) {
  if (tabs.length === 0) {
    return (
      <div className={styles.tabBar}>
        <span className={styles.emptyMessage}>暂无打开的文件</span>
        <div style={{ flex: 1 }} />
        <button className={styles.addButton} onClick={onAddTab} title="打开文件">
          +
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ""}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className={styles.tabName}>{tab.name}</span>
            <button
              className={styles.tabClose}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="关闭"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className={styles.addButton} onClick={onAddTab} title="打开文件">
        +
      </button>
    </div>
  );
}
