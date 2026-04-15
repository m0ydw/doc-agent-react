import { SuperDocEditor } from "@superdoc-dev/react";
import { useRef } from "react";
import type { SuperDocInstance } from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";
import styles from "./doc.module.css";

interface DocProps {
  documentData: Blob | null;
  onLoadError?: (message: string) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onPaginationChange?: (pages: number) => void;
  onRegisterExporter?: (exporter: (() => Promise<Blob | null>) | null) => void;
  zoomPercent?: number;
}

function Doc({
  documentData,
  onLoadError,
  onReadyStateChange,
  onPaginationChange,
  onRegisterExporter,
  zoomPercent = 114,
}: DocProps) {
  const superdocRef = useRef<SuperDocInstance | null>(null);

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
            onReady={(event) => {
              superdocRef.current = event.superdoc;
              // Force a deterministic layout baseline for pagination.
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
              onLoadError?.(`存在不支持内容：${unsupportedSummary}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export default Doc;
