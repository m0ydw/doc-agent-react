import { SuperDocEditor } from "@superdoc-dev/react";
import { useRef, useEffect, useMemo } from "react";
import type { SuperDocInstance } from "@superdoc-dev/react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import "@superdoc-dev/react/style.css";
import styles from "./Doc.module.css";

interface DocProps {
  documentData: Blob | null;
  docId?: string;  // 新增：文档 ID（用于 Yjs 同步）
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
  const providerRef = useRef<HocuspocusProvider | null>(null);

  // 创建 Yjs 文档和 Provider（当有 docId 时）
  const { ydoc, provider } = useMemo(() => {
    if (!docId) {
      return { ydoc: undefined, provider: undefined };
    }

    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: "ws://localhost:1234/hocuspocus",
      name: docId,
      document: ydoc,
      connect: true,
    });

    return { ydoc, provider };
  }, [docId]);

  // 清理 Provider
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
      }
    };
  }, []);

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
            // Yjs 协作配置
            ydoc={ydoc}
            provider={provider}
            onReady={(event) => {
              superdocRef.current = event.superdoc;
              event.superdoc.setZoom(zoomPercent);
              event.superdoc.setTrackedChangesPreferences({
                mode: "final",
                enabled: false,
              });
              onReadyStateChange?.(true);
              onRegisterExporter?.(exportCurrentDocx);
              console.log("SuperDoc ready with Yjs collaboration");
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
              onLoadError?.(`存在不支持内容：${unsupportedSummary}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
