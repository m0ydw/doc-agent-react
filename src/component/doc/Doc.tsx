import { SuperDocEditor } from "@superdoc-dev/react";
import { useRef, useMemo } from "react";
import type { SuperDocInstance, SuperDocModules } from "@superdoc-dev/react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import "@superdoc-dev/react/style.css";
import styles from "./Doc.module.css";

interface DocProps {
  documentData: Blob | null;
  docId?: string;
  onLoadError?: (message: string) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onPaginationChange?: (pages: number) => void;
  onRegisterExporter?: (exporter: (() => Promise<Blob | null>) | null) => void;
  zoomPercent?: number;
}

export default function Doc({
  documentData,
  docId,
  onLoadError,
  onReadyStateChange,
  onPaginationChange,
  onRegisterExporter,
  zoomPercent = 114,
}: DocProps) {
  const superdocRef = useRef<SuperDocInstance | null>(null);

  // 创建 Yjs 协作模块
  const modules = useMemo(() => {
    if (!docId) {
      console.log("[Doc] 无 docId，不创建 Yjs");
      return undefined;
    }

    console.log("[Doc] 创建 Yjs 模块, docId:", docId);

    // 创建 Yjs 文档
    const ydoc = new Y.Doc();
    console.log("[Doc] ydoc 创建完成");

    // 创建 Hocuspocus Provider
    const provider = new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: docId,
      document: ydoc,
    });

    console.log("[Doc] provider 创建完成");

    // 监听事件
    provider.on("status", (event: { status: string }) => {
      console.log("[Doc] Hocuspocus 状态:", event.status);
    });

    provider.on("sync", (synced: boolean) => {
      console.log("[Doc] Hocuspocus 同步:", synced);
    });

    provider.on("connect", () => {
      console.log("[Doc] Hocuspocus 已连接");
    });

    provider.on("disconnect", () => {
      console.log("[Doc] Hocuspocus 已断开");
    });

    provider.on("error", (error: Error) => {
      console.log("[Doc] Hocuspocus 错误:", error.message);
    });

    // 监听 ydoc 变化
    ydoc.on("update", (update: Uint8Array) => {
      console.log("[Doc] ydoc 更新, 大小:", update.length);
    });

    console.log("[Doc] 返回 modules");

    return {
      collaboration: { ydoc, provider: provider as Object },
    } as SuperDocModules;
  }, [docId]);

  const exportCurrentDocx = async (): Promise<Blob | null> => {
    if (!superdocRef.current) return null;

    const result = await superdocRef.current.export({
      exportType: ["docx"],
      triggerDownload: false,
      isFinalDoc: true,
    });

    return result instanceof Blob ? result : null;
  };

  return (
    <div className={styles.viewerShell}>
      {documentData ? (
        <div className={styles.editorRoot}>
          <SuperDocEditor
            document={documentData}
            format="docx"
            documentMode="viewing"
            contained={false}
            viewOptions={{ layout: "print" }}
            layoutEngineOptions={{
              flowMode: "paginated",
              trackedChanges: { mode: "final", enabled: false } as object,
            }}
            comments={{ visible: false }}
            trackChanges={{ visible: false }}
            modules={modules}
            onReady={(event) => {
              console.log("[Doc] onReady 触发");
              superdocRef.current = event.superdoc;
              console.log("[Doc] superdoc:", event.superdoc);
              console.log("[Doc] ydoc:", event.superdoc.ydoc);
              console.log("[Doc] provider:", event.superdoc.provider);

              event.superdoc.setZoom(zoomPercent);
              event.superdoc.setTrackedChangesPreferences({
                mode: "final",
                enabled: false,
              });
              onReadyStateChange?.(true);
              onRegisterExporter?.(exportCurrentDocx);
              console.log("SuperDoc ready");
            }}
            onPaginationUpdate={(event) => {
              onPaginationChange?.(event.totalPages);
            }}
            onContentError={(event) => {
              console.log("[Doc] SuperDoc 内容错误:", event.error.message);
              onLoadError?.(event.error.message);
              onReadyStateChange?.(false);
            }}
            onException={(event) => {
              console.log("[Doc] SuperDoc 异常:", event.error.message);
              onLoadError?.(event.error.message);
              onReadyStateChange?.(false);
            }}
            onUnsupportedContent={(items) => {
              if (!items || !items.length) return;
              const unsupportedSummary = items
                .slice(0, 3)
                .map((it) => `${it.tagName} x${it.count}`)
                .join(", ");
              onLoadError?.(`存在不支持内容：${unsupportedSummary}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}