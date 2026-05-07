/**
 * useDocumentManager — 文档生命周期管理 hook
 *
 * 封装：Tab 状态、文件上传、自动初始化、卸载清理。
 * AppLayout 只需调用此 hook 并渲染 UI。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { message } from "antd";
import { useDropzone } from "react-dropzone";
import {
  getDocumentList,
  getDocumentSeed,
  openDocumentSession,
  uploadDocuments,
} from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import { config } from "@/config";

interface TabData {
  doc: DocumentInfo;
  blob: Blob;
}

export function useDocumentManager() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoInitRef = useRef(false);

  // ---- Tab 状态 ----
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(new Set());
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // ---- 文件列表 ----
  const [fileList, setFileList] = useState<DocumentInfo[]>([]);

  const refreshFileList = useCallback(async () => {
    const res = await getDocumentList();
    if (res.success) setFileList(res.documents);
  }, []);

  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

  // ---- 辅助 ----
  const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : "未知错误";

  // ---- 打开文档（添加标签） ----
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

  // ---- 文件上传 ----
  const uploadFile = useCallback(
    async (file: File) => {
      const isValid =
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx");
      if (!isValid) {
        message.error("仅支持 .docx 文件");
        return;
      }
      if (file.size > config.maxFileSizeMB * 1024 * 1024) {
        message.error(`文件大小超过 ${config.maxFileSizeMB}MB`);
        return;
      }
      const hide = message.loading(`正在上传: ${file.name}`, 0);
      try {
        const uploadRes = await uploadDocuments([file]);
        if (!uploadRes.success || !uploadRes.files?.[0])
          throw new Error("上传接口返回异常");
        const uploaded = uploadRes.files[0];
        // 同步标记：ref 赋值先于 refreshFileList 的 Effect，阻止 autoOpenAll 竞态
        autoInitRef.current = true;
        await refreshFileList();
        hide();
        message.success(`上传成功: ${uploaded.originalName}`);
        await openAndAddTab(uploaded.id);
      } catch (error: unknown) {
        hide();
        message.error(getErrorMessage(error) || "上传失败");
      }
    },
    [refreshFileList, openAndAddTab]
  );

  // ---- react-dropzone ----
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const docxFile = acceptedFiles.find(
        (f) =>
          f.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          f.name.toLowerCase().endsWith(".docx")
      );
      if (docxFile) void uploadFile(docxFile);
      else message.error("请拖入 .docx 文件");
    },
    [uploadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
    },
    noClick: true,
    noKeyboard: true,
  });

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;
      await uploadFile(files[0]);
      event.target.value = "";
    },
    [uploadFile]
  );

  // ---- 标签操作 ----
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

  const handleReorderTabs = useCallback(
    (ordered: Array<{ id: string; name: string }>) => {
      setTabs((prev) => {
        const map = new Map(prev.map((t) => [t.doc.id, t]));
        return ordered.map((item) => map.get(item.id)!).filter(Boolean) as TabData[];
      });
    },
    []
  );

  // ---- 自动初始化 ----
  useEffect(() => {
    if (autoInitRef.current || fileList.length === 0) return;
    autoInitRef.current = true;
    // 仅在上传前触发：上传流程已通过 ref 抢先标记，阻止此处执行

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
      if (newTabs.length > 0) setActiveTabId(newTabs[0].doc.id);
    };

    void autoOpenAll();
  }, [fileList]);

  // ---- 清理：种子文件已由 /seed 路由在发送完成后自动删除，无需前端清理 ----

  return {
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
  };
}
