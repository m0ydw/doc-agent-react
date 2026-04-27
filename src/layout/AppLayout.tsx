import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentViewer, DocumentList } from "@/component";
import TabBar from "@/component/TabBar/TabBar";
import AgentPanel from "@/component/AgentPanel/AgentPanel";
import ResizeHandle from "@/component/ResizeHandle/ResizeHandle";
import {
  cleanupDocuments,
  deleteDocument,
  findText,
  getDocumentList,
  getDocumentSeed,
  openDocumentSession,
  replaceText,
  uploadDocuments,
} from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import styles from "./AppLayout.module.css";

// Tab 数据
interface TabData {
  doc: DocumentInfo;
  blob: Blob;
}

const MAX_FILE_SIZE_MB = 10;

export default function AppLayout() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());

  // Tab 状态
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // 文件列表（弹窗）
  const [fileList, setFileList] = useState<DocumentInfo[]>([]);
  const [showFileList, setShowFileList] = useState(false);

  // Feedback messages
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Agent 面板
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const [agentWidth, setAgentWidth] = useState(360);

  // 拖拽上传
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // 查找替换（TODO: keep until feature refactor）
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findPattern, setFindPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [findResult, setFindResult] = useState<{
    success: boolean;
    count: number;
    positions: Array<{ index: number; text: string; ref: string }>;
  } | null>(null);
  const [replaceResult, setReplaceResult] = useState<{
    success: boolean;
    replaced?: number;
    message?: string;
  } | null>(null);
  const [findStatus, setFindStatus] = useState("");

  // 当前活动文档
  const activeDoc = tabs.find((t) => t.doc.id === activeTabId)?.doc ?? null;
  const activeBlob = tabs.find((t) => t.doc.id === activeTabId)?.blob ?? null;

  // ===== 文件列表 =====

  const refreshFileList = useCallback(async () => {
    const res = await getDocumentList();
    if (res.success) {
      setFileList(res.documents);
    }
  }, []);

  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

  // ===== 页面卸载时清理 =====
  useEffect(() => {
    const handleBeforeUnload = async () => {
      const keepIds = Array.from(uploadedFileIdsRef.current);
      if (keepIds.length > 0) {
        await cleanupDocuments(keepIds);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ===== 打开文档（添加标签） =====

  const openAndAddTab = useCallback(async (docId: string) => {
    const openRes = await openDocumentSession(docId);
    if (!openRes.success || !openRes.document) {
      throw new Error("打开文档失败");
    }
    const seedBlob = await getDocumentSeed(docId);

    const newTab: TabData = {
      doc: openRes.document,
      blob: seedBlob,
    };

    setTabs((prev) => {
      // 如果已存在同一文档，直接激活它
      const existing = prev.find((t) => t.doc.id === docId);
      if (existing) {
        setActiveTabId(docId);
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveTabId(docId);
  }, []);

  // ===== 上传逻辑（按钮 + 拖拽共用） =====

  const uploadFile = useCallback(
    async (file: File) => {
      const isValid =
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx");

      if (!isValid) {
        setErrorMessage("仅支持 .docx 文件");
        return;
      }

      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setErrorMessage(`文件大小超过 ${MAX_FILE_SIZE_MB}MB`);
        return;
      }

      setErrorMessage("");
      setStatusMessage(`正在上传: ${file.name}`);

      try {
        const uploadRes = await uploadDocuments([file]);
        if (!uploadRes.success || !uploadRes.files?.[0]) {
          throw new Error("上传接口返回异常");
        }

        const uploaded = uploadRes.files[0];
        uploadedFileIdsRef.current.add(uploaded.id);
        await refreshFileList();
        setStatusMessage(`上传成功: ${uploaded.originalName}`);

        // 自动打开上传的文件
        await openAndAddTab(uploaded.id);
      } catch (error: any) {
        setErrorMessage(error.message || "上传失败");
      }
    },
    [refreshFileList, openAndAddTab]
  );

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

  // ===== 拖拽上传 =====

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer.files);
      const docxFile = files.find(
        (f) =>
          f.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
      );
      if (docxFile) {
        await uploadFile(docxFile);
      } else {
        setErrorMessage("请拖入 .docx 文件");
      }
    },
    [uploadFile]
  );

  // ===== 标签操作 =====

  const handleAddTab = useCallback(() => {
    setShowFileList(true);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.doc.id === tabId);
        const newTabs = prev.filter((t) => t.doc.id !== tabId);

        if (activeTabId === tabId && newTabs.length > 0) {
          // 激活相邻标签
          const nextIdx = Math.min(idx, newTabs.length - 1);
          setActiveTabId(newTabs[nextIdx].doc.id);
        } else if (newTabs.length === 0) {
          setActiveTabId(null);
        }

        return newTabs;
      });
    },
    [activeTabId]
  );

  // ===== 文件列表弹窗 =====

  const handleSelectDocument = useCallback(
    async (doc: DocumentInfo) => {
      try {
        setStatusMessage(`正在打开: ${doc.originalName}`);
        await openAndAddTab(doc.id);
        setStatusMessage(`已打开: ${doc.originalName}`);
      } catch (error: any) {
        setErrorMessage(error.message || "打开文档失败");
      } finally {
        setShowFileList(false);
      }
    },
    [openAndAddTab]
  );

  const handleDeleteDocument = useCallback(
    async (id: string, _fileName: string) => {
      try {
        await deleteDocument(id);
        // 如果删除的是已打开的标签，关闭标签
        setTabs((prev) => {
          const filtered = prev.filter((t) => t.doc.id !== id);
          if (filtered.length !== prev.length && activeTabId === id) {
            setActiveTabId(filtered.length > 0 ? filtered[0].doc.id : null);
          }
          return filtered;
        });
        await refreshFileList();
        setStatusMessage("文件已删除");
      } catch {
        setErrorMessage("删除失败");
      }
    },
    [activeTabId, refreshFileList]
  );

  // ===== 分隔条拖拽 =====

  const handleResize = useCallback((deltaX: number) => {
    setAgentWidth((prev) => {
      const next = prev + deltaX; // deltaX positive = drag left (shrink agent)
      if (next < 80) {
        setAgentCollapsed(true);
        return 360; // reset to default when re-opening
      }
      if (next > 800) return 800; // max width
      return next;
    });
  }, []);

  const handleToggleAgent = useCallback(() => {
    setAgentCollapsed((prev) => !prev);
  }, []);

  // ===== 查找替换（TODO: keep until feature refactor） =====

  const handleFind = useCallback(async () => {
    if (!activeTabId || !findPattern.trim()) {
      setFindStatus("请先选择文档并输入查找内容");
      return;
    }
    setFindStatus("正在查找...");
    try {
      const result = await findText(activeTabId, findPattern);
      setFindResult(result);
      setReplaceResult(null);
      setFindStatus(`找到 ${result.count} 处匹配`);
    } catch (error: any) {
      setFindStatus("查找失败: " + error.message);
    }
  }, [activeTabId, findPattern]);

  const handleReplaceFirst = useCallback(async () => {
    if (!activeTabId || !findPattern.trim() || !replaceWith.trim()) {
      setFindStatus("请输入查找内容和替换内容");
      return;
    }
    setFindStatus("正在替换...");
    try {
      const result = await replaceText(
        activeTabId,
        findPattern,
        replaceWith,
        false
      );
      setReplaceResult(result);
      setFindStatus(
        result.success
          ? "替换完成 (1处)"
          : "替换失败: " + (result.message || "")
      );
    } catch (error: any) {
      setFindStatus("替换失败: " + error.message);
    }
  }, [activeTabId, findPattern, replaceWith]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeTabId || !findPattern.trim() || !replaceWith.trim()) {
      setFindStatus("请输入查找内容和替换内容");
      return;
    }
    setFindStatus("正在替换全部...");
    try {
      const result = await replaceText(
        activeTabId,
        findPattern,
        replaceWith,
        true
      );
      setReplaceResult(result);
      setFindStatus(
        result.success
          ? `替换完成 (${result.replaced}处)`
          : "替换失败: " + (result.message || "")
      );
    } catch (error: any) {
      setFindStatus("替换失败: " + error.message);
    }
  }, [activeTabId, findPattern, replaceWith]);

  // ===== 渲染 =====

  return (
    <div className={styles.page}>
      {/* TabBar */}
      <TabBar
        tabs={tabs.map((t) => ({ id: t.doc.id, name: t.doc.originalName }))}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
      />

      {/* Main content */}
      <div
        className={styles.mainContainer}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Status messages */}
        {(statusMessage || errorMessage) && (
          <div
            style={{
              padding: "4px 12px",
              fontSize: "12px",
              background: errorMessage ? "#fff0f0" : "#f0f8f0",
              color: errorMessage ? "#d32f2f" : "#2e7d32",
              borderBottom: "1px solid #ddd",
              flexShrink: 0,
            }}
          >
            {errorMessage || statusMessage}
          </div>
        )}

        {/* Split panel */}
        <div className={styles.splitPanel}>
          {/* Document area */}
          <div className={styles.documentPanel}>
            {/* Tab content (all instances alive) */}
            <div className={styles.tabContentContainer}>
              {tabs.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>📄</p>
                  <p>拖拽 .docx 文件到此处，或点击 + 上传</p>
                </div>
              ) : (
                tabs.map((tab) => (
                  <div
                    key={tab.doc.id}
                    className={styles.tabContent}
                    style={{
                      display: tab.doc.id === activeTabId ? "block" : "none",
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

            {/* Find/Replace toggle button */}
            <button
              className={styles.findReplaceToggle}
              onClick={() => setShowFindReplace(!showFindReplace)}
            >
              {showFindReplace ? "▼" : "▲"} 查找替换
            </button>

            {/* Find/Replace panel (TODO: keep until feature refactor) */}
            {showFindReplace && (
              <div className={styles.findReplacePanel}>
                <div
                  style={{
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <label style={{ width: "60px", flexShrink: 0 }}>
                      查找:
                    </label>
                    <input
                      type="text"
                      value={findPattern}
                      onChange={(e) => setFindPattern(e.target.value)}
                      placeholder="输入要查找的内容"
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <label style={{ width: "60px", flexShrink: 0 }}>
                      替换为:
                    </label>
                    <input
                      type="text"
                      value={replaceWith}
                      onChange={(e) => setReplaceWith(e.target.value)}
                      placeholder="输入替换内容"
                      style={{
                        flex: 1,
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={handleFind}
                      style={{
                        padding: "4px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background: "#2196F3",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      查找
                    </button>
                    <button
                      onClick={handleReplaceFirst}
                      style={{
                        padding: "4px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background: "#FF9800",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      替换第一个
                    </button>
                    <button
                      onClick={handleReplaceAll}
                      style={{
                        padding: "4px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background: "#f44336",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      替换全部
                    </button>
                  </div>
                  {findStatus && (
                    <p
                      style={{
                        margin: 0,
                        padding: "4px 8px",
                        background: "#e8f5e9",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    >
                      {findStatus}
                    </p>
                  )}
                  {findResult && (
                    <div
                      style={{
                        padding: "4px 8px",
                        background: "#e3f2fd",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    >
                      <strong>查找结果:</strong> 找到 {findResult.count} 处匹配
                      {findResult.positions.length > 0 && (
                        <ul
                          style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}
                        >
                          {findResult.positions.slice(0, 5).map((pos, i) => (
                            <li key={i}>
                              [{pos.index}]{" "}
                              {pos.text?.substring(0, 50) ?? "(无文本内容)"}...
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {replaceResult && (
                    <div
                      style={{
                        padding: "4px 8px",
                        background: replaceResult.success
                          ? "#fff3e0"
                          : "#ffebee",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    >
                      <strong>替换结果:</strong>{" "}
                      {replaceResult.success
                        ? `已替换 ${replaceResult.replaced ?? 0} 处`
                        : `失败：${replaceResult.message ?? "未知错误"}`}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Resize handle */}
          {!agentCollapsed && <ResizeHandle onResize={handleResize} />}

          {/* Agent panel */}
          <div
            style={{
              width: agentCollapsed ? "32px" : `${agentWidth}px`,
              flexShrink: 0,
              overflow: "hidden",
              transition: agentCollapsed ? "width 0.2s ease" : "none",
            }}
          >
            <AgentPanel
              collapsed={agentCollapsed}
              onToggleCollapse={handleToggleAgent}
            />
          </div>
        </div>

        {/* Drag-and-drop overlay */}
        {dragOver && (
          <div className={styles.dropOverlay}>
            <div className={styles.dropOverlayText}>释放以上传 .docx 文件</div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {/* File list modal */}
      {showFileList && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowFileList(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "8px 0" }}>
              <DocumentList
                documents={fileList}
                onSelectDocument={handleSelectDocument}
                onDeleteDocument={handleDeleteDocument}
                onClose={() => setShowFileList(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
