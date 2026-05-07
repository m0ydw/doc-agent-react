import { useState, useCallback, useRef } from "react";
import {
  ConfigProvider,
  theme,
  Empty,
  Button,
  Typography,
  Flex,
} from "antd";
import { DownloadOutlined } from "@ant-design/icons";

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
  // Y.Doc 导出函数（从 SuperDocEditor 注册）
  const exportFnRef = useRef<(() => Promise<Blob | null>) | null>(null);

  const handleDownload = useCallback(async () => {
    if (!exportFnRef.current) return;
    try {
      const blob = await exportFnRef.current();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `文档_${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

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
                        onRegisterExporter={(fn) => { exportFnRef.current = fn; }}
                      />
                    </div>
                  ))
                )}
              </div>

              <Flex style={{ borderTop: "1px solid #ddd", background: "#f5f5f5" }}>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setShowFindReplace(!showFindReplace)}
                  style={{ borderRadius: 0, height: 32, flex: 1 }}
                >
                  {showFindReplace ? "▼" : "▲"} 查找替换
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                  style={{ borderRadius: 0, height: 32, borderLeft: "1px solid #ddd" }}
                  title="下载当前文档（从 Yjs 导出）"
                />
              </Flex>

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
