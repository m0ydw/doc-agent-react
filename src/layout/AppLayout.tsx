import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentViewer } from "@/component";
import TabBar from "@/component/TabBar/TabBar";
import AgentPanel from "@/component/AgentPanel/AgentPanel";
import ResizeHandle from "@/component/ResizeHandle/ResizeHandle";
import {
  cleanupDocuments,
  findText,
  getDocumentList,
  getDocumentSeed,
  openDocumentSession,
  replaceText,
  uploadDocuments,
} from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import styles from "./AppLayout.module.css";

interface TabData {
  doc: DocumentInfo;
  blob: Blob;
}

const MAX_FILE_SIZE_MB = 10;

export default function AppLayout() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoInitRef = useRef(false);

  // Tab 状态
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(new Set());
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // 文件列表（供自动初始化使用）
  const [fileList, setFileList] = useState<DocumentInfo[]>([]);

  // Feedback messages
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 3秒自动关闭消息
  const showStatus = useCallback((msg: string, isError?: boolean) => {
    if (isError) {
      setErrorMessage(msg);
      setStatusMessage("");
    } else {
      setStatusMessage(msg);
      setErrorMessage("");
    }
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage("");
      setErrorMessage("");
      statusTimerRef.current = null;
    }, 3000);
  }, []);

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

  // ===== 文件列表 =====
  const refreshFileList = useCallback(async () => {
    const res = await getDocumentList();
    if (res.success) setFileList(res.documents);
  }, []);

  // 启动时获取文件列表
  useEffect(() => { void refreshFileList(); }, [refreshFileList]);

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

    autoOpenAll();
  }, [fileList]);

  // ===== 页面卸载时清理 =====
  useEffect(() => {
    const handleBeforeUnload = async () => {
      const keepIds = Array.from(uploadedFileIdsRef.current);
      if (keepIds.length > 0) await cleanupDocuments(keepIds);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ===== 打开文档（添加标签） =====
  const openAndAddTab = useCallback(async (docId: string) => {
    const openRes = await openDocumentSession(docId);
    if (!openRes.success || !openRes.document) throw new Error("打开文档失败");
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

  // ===== 上传逻辑（按钮 + 拖拽共用） =====
  const uploadFile = useCallback(async (file: File) => {
    const isValid =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");
    if (!isValid) { showStatus("仅支持 .docx 文件", true); return; }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) { showStatus(`文件大小超过 ${MAX_FILE_SIZE_MB}MB`, true); return; }
    showStatus(`正在上传: ${file.name}`);
    try {
      const uploadRes = await uploadDocuments([file]);
      if (!uploadRes.success || !uploadRes.files?.[0]) throw new Error("上传接口返回异常");
      const uploaded = uploadRes.files[0];
      uploadedFileIdsRef.current.add(uploaded.id);
      await refreshFileList();
      showStatus(`上传成功: ${uploaded.originalName}`);
      await openAndAddTab(uploaded.id);
    } catch (error: any) {
      showStatus(error.message || "上传失败", true);
    }
  }, [refreshFileList, openAndAddTab, showStatus]);

  // ===== 文件上传按钮 =====
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    await uploadFile(files[0]);
    event.target.value = "";
  }, [uploadFile]);

  // ===== 拖拽上传（使用 capture 阶段注册，避免被子组件拦截） =====
  const handleNativeDragEnter = useCallback((e: DragEvent) => {
    // 只处理文件拖拽，忽略标签拖拽等内部 DnD
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDragOver(true);
  }, []);
  const handleNativeDragLeave = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragOver(false);
  }, []);
  const handleNativeDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
  }, []);
  const handleNativeDrop = useCallback((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounterRef.current = 0;
    const files = Array.from(e.dataTransfer?.files ?? []);
    const docxFile = files.find(
      (f) => f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || f.name.toLowerCase().endsWith(".docx")
    );
    if (docxFile) uploadFile(docxFile);
    else showStatus("请拖入 .docx 文件", true);
  }, [uploadFile, showStatus]);

  useEffect(() => {
    // 在 capture 阶段注册，确保优先级高于子组件
    document.addEventListener("dragenter", handleNativeDragEnter, { capture: true });
    document.addEventListener("dragleave", handleNativeDragLeave, { capture: true });
    document.addEventListener("dragover", handleNativeDragOver, { capture: true });
    document.addEventListener("drop", handleNativeDrop, { capture: true });
    return () => {
      document.removeEventListener("dragenter", handleNativeDragEnter, { capture: true });
      document.removeEventListener("dragleave", handleNativeDragLeave, { capture: true });
      document.removeEventListener("dragover", handleNativeDragOver, { capture: true });
      document.removeEventListener("drop", handleNativeDrop, { capture: true });
    };
  }, [handleNativeDragEnter, handleNativeDragLeave, handleNativeDragOver, handleNativeDrop]);

  // ===== 标签操作 =====
  const handleAddTab = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCloseTab = useCallback((tabId: string) => {
    // 标记为"正在关闭"触发动画
    setClosingTabIds((prev) => new Set(prev).add(tabId));
    // 250ms 后从 state 移除（动画结束后）
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
  const handleReorderTabs = useCallback((ordered: Array<{ id: string; name: string }>) => {
    setTabs((prev) => {
      const map = new Map(prev.map((t) => [t.doc.id, t]));
      return ordered.map((item) => map.get(item.id)!).filter(Boolean) as TabData[];
    });
  }, []);

  // ===== 分隔条拖拽 =====
  const handleResize = useCallback((deltaX: number) => {
    setAgentWidth((prev) => {
      const next = prev + deltaX;
      if (next < 80) { setAgentCollapsed(true); return 360; }
      if (next > 800) return 800;
      return next;
    });
  }, []);
  const handleToggleAgent = useCallback(() => setAgentCollapsed((p) => !p), []);

  // ===== 查找替换（TODO: keep until feature refactor） =====
  const handleFind = useCallback(async () => {
    if (!activeTabId || !findPattern.trim()) { setFindStatus("请先选择文档并输入查找内容"); return; }
    setFindStatus("正在查找...");
    try {
      const result = await findText(activeTabId, findPattern);
      setFindResult(result); setReplaceResult(null);
      setFindStatus(`找到 ${result.count} 处匹配`);
    } catch (error: any) { setFindStatus("查找失败: " + error.message); }
  }, [activeTabId, findPattern]);

  const handleReplaceFirst = useCallback(async () => {
    if (!activeTabId || !findPattern.trim() || !replaceWith.trim()) { setFindStatus("请输入查找内容和替换内容"); return; }
    setFindStatus("正在替换...");
    try {
      const result = await replaceText(activeTabId, findPattern, replaceWith, false);
      setReplaceResult(result);
      setFindStatus(result.success ? "替换完成 (1处)" : "替换失败: " + (result.message || ""));
    } catch (error: any) { setFindStatus("替换失败: " + error.message); }
  }, [activeTabId, findPattern, replaceWith]);

  const handleReplaceAll = useCallback(async () => {
    if (!activeTabId || !findPattern.trim() || !replaceWith.trim()) { setFindStatus("请输入查找内容和替换内容"); return; }
    setFindStatus("正在替换全部...");
    try {
      const result = await replaceText(activeTabId, findPattern, replaceWith, true);
      setReplaceResult(result);
      setFindStatus(result.success ? `替换完成 (${result.replaced}处)` : "替换失败: " + (result.message || ""));
    } catch (error: any) { setFindStatus("替换失败: " + error.message); }
  }, [activeTabId, findPattern, replaceWith]);

  // ===== 渲染 =====
  return (
    <div className={styles.page}>
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
        {/* Status messages */}
        {(statusMessage || errorMessage) && (
          <div className={`${styles.statusBar} ${errorMessage ? styles.statusBarError : styles.statusBarSuccess}`}>
            {errorMessage || statusMessage}
          </div>
        )}

        {/* Split panel */}
        <div className={styles.splitPanel}>
          <div className={styles.documentPanel}>
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

            {/* Find/Replace toggle */}
            <button className={styles.findReplaceToggle} onClick={() => setShowFindReplace(!showFindReplace)}>
              {showFindReplace ? "▼" : "▲"} 查找替换
            </button>

            {/* Find/Replace panel (TODO: keep until feature refactor) */}
            {showFindReplace && (
              <div className={styles.findReplacePanel}>
                <div className={styles.findReplaceInner}>
                  <div className={styles.findReplaceRow}>
                    <label className={styles.findReplaceLabel}>查找:</label>
                    <input
                      className={styles.findReplaceInput}
                      type="text" value={findPattern}
                      onChange={(e) => setFindPattern(e.target.value)}
                      placeholder="输入要查找的内容"
                    />
                  </div>
                  <div className={styles.findReplaceRow}>
                    <label className={styles.findReplaceLabel}>替换为:</label>
                    <input
                      className={styles.findReplaceInput}
                      type="text" value={replaceWith}
                      onChange={(e) => setReplaceWith(e.target.value)}
                      placeholder="输入替换内容"
                    />
                  </div>
                  <div className={styles.findReplaceActions}>
                    <button className={styles.btnFind} onClick={handleFind}>查找</button>
                    <button className={styles.btnReplace} onClick={handleReplaceFirst}>替换第一个</button>
                    <button className={styles.btnReplaceAll} onClick={handleReplaceAll}>替换全部</button>
                  </div>
                  {findStatus && <p className={styles.resultStatus}>{findStatus}</p>}
                  {findResult && (
                    <div className={styles.resultFind}>
                      <strong>查找结果:</strong> 找到 {findResult.count} 处匹配
                      {findResult.positions.length > 0 && (
                        <ul className={styles.resultList}>
                          {findResult.positions.slice(0, 5).map((pos, i) => (
                            <li key={i}>[{pos.index}] {pos.text?.substring(0, 50) ?? "(无文本内容)"}...</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {replaceResult && (
                    <div className={`${styles.resultReplace} ${replaceResult.success ? styles.resultReplaceSuccess : styles.resultReplaceFailure}`}>
                      <strong>替换结果:</strong>{" "}
                      {replaceResult.success ? `已替换 ${replaceResult.replaced ?? 0} 处` : `失败：${replaceResult.message ?? "未知错误"}`}
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
            className={`${styles.agentWrapper} ${agentCollapsed ? styles.agentWrapperCollapsed : styles.agentWrapperExpanded}`}
            style={{ width: agentCollapsed ? "32px" : `${agentWidth}px` }}
          >
            <AgentPanel collapsed={agentCollapsed} onToggleCollapse={handleToggleAgent} activeDocId={activeTabId} />
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
      <input ref={fileInputRef} type="file" accept=".doc,.docx" onChange={handleFileChange} className={styles.hiddenInput} />

    </div>
  );
}
