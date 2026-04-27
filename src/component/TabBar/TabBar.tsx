import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "./TabBar.module.css";

export interface TabItem {
  id: string;
  name: string;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  closingTabIds: Set<string>;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onReorderTabs: (tabs: TabItem[]) => void;
}

function SortableTab({
  tab,
  isActive,
  isClosing,
  onSelect,
  onClose,
}: {
  tab: TabItem;
  isActive: boolean;
  isClosing: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
    zIndex: isDragging ? 0 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      className={`${styles.tabWrapper} ${isClosing ? styles.tabClosing : ""}`}
      style={style}
    >
      <div
        className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
        {...attributes}
        {...listeners}
        onClick={onSelect}
      >
        <span className={styles.tabName}>{tab.name}</span>
        <button
          className={styles.tabClose}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function TabBar({
  tabs,
  activeTabId,
  closingTabIds,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onReorderTabs,
}: TabBarProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tabs, oldIndex, newIndex);
      onReorderTabs(reordered);
    },
    [tabs, onReorderTabs]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // 被拖拽中的标签（浮层用）
  const activeTab = activeId
    ? tabs.find((t) => t.id === activeId)
    : null;

  // 空状态
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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.tabBar}>
        <div className={styles.tabs}>
          <SortableContext
            items={tabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isClosing={closingTabIds.has(tab.id)}
                onSelect={() => onSelectTab(tab.id)}
                onClose={() => onCloseTab(tab.id)}
              />
            ))}
          </SortableContext>
        </div>
        <button className={styles.addButton} onClick={onAddTab} title="打开文件">
          +
        </button>
      </div>

      {/* 拖拽浮层 — 跟随鼠标 */}
      <DragOverlay>
        {activeTab ? (
          <div className={`${styles.tab} ${styles.tabActive} ${styles.tabOverlay}`}>
            <span className={styles.tabName}>{activeTab.name}</span>
            <button className={styles.tabClose}>×</button>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
