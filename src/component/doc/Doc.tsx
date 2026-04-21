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

  // 创建 Yjs 协作模块（当有 docId 时）
  const modules = useMemo(() => {
    if (!docId) {
      console.log("[Doc] 无 docId，不创建 Yjs 协作模块");
      return undefined;
    }

    console.log("[Doc] 创建 Yjs 协作模块，docId:", docId);
    
    const ydoc = new Y.Doc();
    console.log("[Doc] Y.Doc 创建完成");
    
    const provider = new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: docId,
      document: ydoc,
    });
    
    // 添加连接状态监听
    provider.on("status", (event: { status: string }) => {
      console.log("[Doc] Hocuspocus 连接状态:", event.status);
    });
    
    provider.on("sync", (synced: boolean) => {
      console.log("[Doc] Hocuspocus 同步状态:", synced);
    });
    
    provider.on("connect", () => {
      console.log("[Doc] Hocuspocus 已连接");
    });
    
    provider.on("disconnect", () => {
      console.log("[Doc] Hocuspocus 已断开连接");
    });
    
    provider.on("error", (error: Error) => {
      console.log("[Doc] Hocuspocus 错误:", error.message);
    });

    console.log("[Doc] HocuspocusProvider 创建完成");

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
              superdocRef.current = event.superdoc;
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
              console.log("SuperDoc pagination pages:", event.totalPages);
            }}
            onContentError={(event) => {
              onLoadError?.(event.error.message);
              onReadyStateChange?.(false);
            }}
            onException={(event) => {
              onLoadError?.(event.error.message);
              onReadyStateChange?.(false);
            }}
            onUnsupportedContent={(items) => {
              if (!items.length) return;
              const unsupportedSummary = items
                .slice(0, 3)
                .map((it) => `${it.tagName} x${it.count}`)
                .join(", ");
              onLoadError?.(`存在���支持内容：${unsupportedSummary}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
