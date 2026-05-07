import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConfigProvider,
  theme,
  Empty,
  Button,
  Typography,
  Flex,
  message,
} from "antd";
import { useDropzone } from "react-dropzone";

import { DocumentViewer } from "@/component";
import TabBar from "@/component/TabBar/TabBar";
import AgentPanel from "@/component/AgentPanel/AgentPanel";
import ResizeHandle from "@/component/ResizeHandle/ResizeHandle";
import FindReplacePanel from "@/component/FindReplacePanel";
import {
  cleanupDocuments,
  getDocumentList,
  getDocumentSeed,
  openDocumentSession,
  uploadDocuments,
} from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import { config } from "@/config";
import styles from "./AppLayout.module.css";

/** 主区域亮色主题 */
const lightTheme: Parameters<typeof ConfigProvider>[0]["theme"] = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#0066cc",
    colorBgContainer: "#ffffff",
    borderRadius: 6,
    fontSize: 13,
  },
};

interface TabData {
  doc: DocumentInfo;
  blob: Blob;
}

export default function AppLayout() {
  const [messageApi, contextHolder] = message.useMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());
  const autoInitRef = useRef(false);

  // Tab 状态
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(new Set());
  const activeTabIdRef = useRef(activeTabId);

  // 同步 ref（移到 useEffect 避免渲染副作用）
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // 文件列表（供自动初始化使用）
  const [fileList, setFileList] = useState<DocumentInfo[]>([]);

  // Agent 面板
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [agentWidth, setAgentWidth] = useState(360);

  // 查找替换
  const [showFindReplace, setShowFindReplace] = useState(false);

  // 辅助：获取标准错误消息
  const getErrorMessage = (error: unknown): string => {
    return error instanceof Error ? error.message : "未知错误";
  };

  // ===== 文件列表 =====
  const refreshFileList = useCallback(async () => {
    const res = await getDocumentList();
    if (res.success) setFileList(res.documents);
  }, []);

  // 启动时获取文件列表
  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

  // 自动初始化所有已上传文档为标签（仅执行一次）
  useEffect(() => {
    if (autoInitRef.current || fileList.length === 0) return;
    autoInitRef.current = true;

    const autoOpenAll = async () => {
      const results = await Promise.all(
        fileList.map(async (doc) => {
          try {
            const openRes = await openDocumentSession(doc.id);
            if (!openRes.success || !openRes.document) return null;
            const seedBlob = await getDocumentSeed(doc.id);
            return { doc: openRes.document, blob: seedBlob } as TabData;
          } catch (err) {
            console.error("自动打开文档失败:", doc.originalName, err);
            return null;
          }
        })
      );
      const newTabs = results.filter((t): t is TabData => t !== null);
      setTabs(newTabs);
      if (newTabs.length > 0) {
        setActiveTabId(newTabs[0].doc.id);
      }
    };

    void autoOpenAll();
  }, [fileList]);

  // ===== 页面卸载时清理 =====
  useEffect(() => {
    const handleBeforeUnload = () => {
      const keepIds = Array.from(uploadedFileIdsRef.current);
      if (keepIds.length > 0) {
        // 使用 sendBeacon 或同步方式确保发送
        navigator.sendBeacon?.(
          `${config.docsApiUrl}/cleanup`,
          JSON.stringify({ keepIds })
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ===== 打开文档（添加标签） =====
  const openAndAddTab = useCallback(async (docId: string) => {
    const openRes = await openDocumentSession(docId);
    if (!openRes.success || !openRes.document)
      throw new Error("打开文档失败");
    const seedBlob = await getDocumentSeed(docId);
    const newTab: TabData = { doc: openRes.document, blob: seedBlob };
    setTabs((prev) => {
      if (prev.find((t) => t.doc.id === docId)) {
        setActiveTabId(docId);
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveTabId(docId);
  }, []);

  // ===== 上传逻辑（使用 react-dropzone 的 onDrop 回调） =====
  const uploadFile = useCallback(
    async (file: File) => {
      const isValid =
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx");
      if (!isValid) {
        messageApi.error("仅支持 .docx 文件");
        return;
      }
      if (file.size > config.maxFileSizeMB * 1024 * 1024) {
        messageApi.error(`文件大小超过 ${config.maxFileSizeMB}MB`);
        return;
      }
      const hide = messageApi.loading(`正在上传: ${file.name}`, 0);
      try {
        const uploadRes = await uploadDocuments([file]);
        if (!uploadRes.success || !uploadRes.files?.[0])
          throw new Error("上传接口返回异常");
        const uploaded = uploadRes.files[0];
        uploadedFileIdsRef.current.add(uploaded.id);
        await refreshFileList();
        hide();
        messageApi.success(`上传成功: ${uploaded.originalName}`);
        await openAndAddTab(uploaded.id);
      } catch (error: unknown) {
        hide();
        messageApi.error(getErrorMessage(error) || "上传失败");
      }
    },
    [refreshFileList, openAndAddTab, messageApi]
  );

  // ===== react-dropzone 集成（替代手搓 DnD） =====
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const docxFile = acceptedFiles.find(
        (f) =>
          f.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
      );
      if (docxFile) {
        void uploadFile(docxFile);
      } else {
        messageApi.error("请拖入 .docx 文件");
      }
    },
    [uploadFile, messageApi]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/msword": [".doc"],
    },
    noClick: true,
    noKeyboard: true,
  });

  // ===== 文件上传按钮 =====
  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;
      await uploadFile(files[0]);
      event.target.value = "";
    },
    [uploadFile]
  );

  // ===== 标签操作 =====
  const handleAddTab = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    setClosingTabIds((prev) => new Set(prev).add(tabId));
    setTimeout(() => {
      const currentActive = activeTabIdRef.current;
      setClosingTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.doc.id === tabId);
        const newTabs = prev.filter((t) => t.doc.id !== tabId);
        if (currentActive === tabId && newTabs.length > 0)
          setActiveTabId(newTabs[Math.min(idx, newTabs.length - 1)].doc.id);
        else if (newTabs.length === 0) setActiveTabId(null);
        return newTabs;
      });
    }, 250);
  }, []);

  // 标签拖拽排序
  const handleReorderTabs = useCallback(
    (ordered: Array<{ id: string; name: string }>) => {
      setTabs((prev) => {
        const map = new Map(prev.map((t) => [t.doc.id, t]));
        return ordered
          .map((item) => map.get(item.id)!)
          .filter(Boolean) as TabData[];
      });
    },
    []
  );

  // ===== 分隔条拖拽 =====
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
  const handleToggleAgent = useCallback(
    () => setAgentCollapsed((p) => !p),
    []
  );

  // ===== 渲染 =====
  return (
    <ConfigProvider theme={lightTheme}>
      {contextHolder}
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
          {/* Split panel */}
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
                      style={{
                        display:
                          tab.doc.id === activeTabId ? "block" : "none",
                      }}
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

              {/* Find/Replace toggle */}
              <Button
                type="text"
                size="small"
                block
                onClick={() => setShowFindReplace(!showFindReplace)}
                style={{
                  background: "#f5f5f5",
                  borderTop: "1px solid #ddd",
                  borderRadius: 0,
                  height: 32,
                }}
              >
                {showFindReplace ? "▼" : "▲"} 查找替换
              </Button>

              {/* Find/Replace panel（已抽取为独立组件） */}
              {showFindReplace && (
                <div className={styles.findReplacePanel}>
                  <FindReplacePanel activeDocId={activeTabId} />
                </div>
              )}
            </div>

            {/* Resize handle */}
            {!agentCollapsed && <ResizeHandle onResize={handleResize} />}

            {/* Agent panel */}
            <div
              className={`${styles.agentWrapper} ${
                agentCollapsed
                  ? styles.agentWrapperCollapsed
                  : styles.agentWrapperExpanded
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

          {/* react-dropzone 拖拽覆盖层 */}
          {isDragActive && (
            <div className={styles.dropOverlay}>
              <div className={styles.dropOverlayText}>
                释放以上传 .docx 文件
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
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
