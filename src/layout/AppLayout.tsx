import { useState, useCallback } from "react";
import {
  ConfigProvider,
  theme,
  Empty,
  Button,
  Typography,
  Flex,
} from "antd";

import { DocumentViewer } from "@/component";
import TabBar from "@/component/TabBar/TabBar";
import AgentPanel from "@/component/AgentPanel/AgentPanel";
import ResizeHandle from "@/component/ResizeHandle/ResizeHandle";
import FindReplacePanel from "@/component/FindReplacePanel";
import { useDocumentManager } from "./useDocumentManager";
import styles from "./AppLayout.module.css";

const lightTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#0066cc",
    colorBgContainer: "#ffffff",
    borderRadius: 6,
    fontSize: 13,
  },
};

export default function AppLayout() {
  const {
    tabs,
    activeTabId,
    closingTabIds,
    fileInputRef,
    getRootProps,
    getInputProps,
    isDragActive,
    handleFileChange,
    handleAddTab,
    handleCloseTab,
    handleReorderTabs,
    setActiveTabId,
  } = useDocumentManager();

  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [agentWidth, setAgentWidth] = useState(360);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const handleResize = useCallback((deltaX: number) => {
    setAgentWidth((prev) => {
      const next = prev + deltaX;
      if (next < 80) {
        setAgentCollapsed(true);
        return 360;
      }
      if (next > 800) return 800;
      return next;
    });
  }, []);

  const handleToggleAgent = useCallback(() => setAgentCollapsed((p) => !p), []);

  return (
    <ConfigProvider theme={lightTheme}>
      <div className={styles.page} {...getRootProps()}>
        <input {...getInputProps()} />

        <TabBar
          tabs={tabs.map((t) => ({ id: t.doc.id, name: t.doc.originalName }))}
          activeTabId={activeTabId}
          closingTabIds={closingTabIds}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onAddTab={handleAddTab}
          onReorderTabs={handleReorderTabs}
        />

        <div className={styles.mainContainer}>
          <div className={styles.splitPanel}>
            <div className={styles.documentPanel}>
              <div className={styles.tabContentContainer}>
                {tabs.length === 0 ? (
                  <Flex align="center" justify="center" style={{ height: "100%" }}>
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <Typography.Text type="secondary">
                          拖拽 .docx 文件到此处，或点击 + 上传
                        </Typography.Text>
                      }
                    />
                  </Flex>
                ) : (
                  tabs.map((tab) => (
                    <div
                      key={tab.doc.id}
                      className={styles.tabContent}
                      style={{ display: tab.doc.id === activeTabId ? "block" : "none" }}
                    >
                      <DocumentViewer
                        documentData={tab.blob}
                        docId={tab.doc.roomName || tab.doc.id}
                        collaborationWsUrl={tab.doc.collaboration?.wsUrl}
                        docKey={tab.doc.id}
                      />
                    </div>
                  ))
                )}
              </div>

              <Button
                type="text"
                size="small"
                block
                onClick={() => setShowFindReplace(!showFindReplace)}
                style={{ background: "#f5f5f5", borderTop: "1px solid #ddd", borderRadius: 0, height: 32 }}
              >
                {showFindReplace ? "▼" : "▲"} 查找替换
              </Button>

              {showFindReplace && (
                <div className={styles.findReplacePanel}>
                  <FindReplacePanel activeDocId={activeTabId} />
                </div>
              )}
            </div>

            {!agentCollapsed && <ResizeHandle onResize={handleResize} />}

            <div
              className={`${styles.agentWrapper} ${
                agentCollapsed ? styles.agentWrapperCollapsed : styles.agentWrapperExpanded
              }`}
              style={{ width: agentCollapsed ? "32px" : `${agentWidth}px` }}
            >
              <AgentPanel
                collapsed={agentCollapsed}
                onToggleCollapse={handleToggleAgent}
                activeDocId={activeTabId}
              />
            </div>
          </div>

          {isDragActive && (
            <div className={styles.dropOverlay}>
              <div className={styles.dropOverlayText}>释放以上传 .docx 文件</div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".doc,.docx"
          onChange={handleFileChange}
          className={styles.hiddenInput}
        />
      </div>
    </ConfigProvider>
  );
}
