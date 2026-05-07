import { SuperDocEditor } from "@superdoc-dev/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SuperDocInstance } from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";
import { useCollabConnection } from "@/hooks/useCollabConnection";
import { config } from "@/config";
import styles from "./Doc.module.css";

interface DocProps {
  documentData: Blob | null;
  docId?: string;
  collaborationWsUrl?: string;
  onLoadError?: (message: string) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onPaginationChange?: (pages: number) => void;
  onRegisterExporter?: (exporter: (() => Promise<Blob | null>) | null) => void;
  zoomPercent?: number;
}

export default function Doc({
  documentData,
  docId,
  collaborationWsUrl = config.collabWsUrl,
  onLoadError,
  onReadyStateChange,
  onPaginationChange,
  onRegisterExporter,
  zoomPercent = 114,
}: DocProps) {
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const upgradedRef = useRef(false);

  // 使用标准 hook 管理协作连接（替换手搓 createCollabRuntime + 轮询 + as any）
  const { runtime: collabRuntime } = useCollabConnection(docId, collaborationWsUrl);

  const collaborationUser = useMemo(
    () => ({
      name: "Web",
      email: `web-${Math.random().toString(36).slice(2)}@local`,
    }),
    []
  );

  // 当 docId 变化时重置升级标志
  useEffect(() => {
    upgradedRef.current = false;
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
          {collabRuntime ? (
            <SuperDocEditor
              document={documentData}
              format="docx"
              documentMode="editing"
              role="editor"
              contained={false}
              viewOptions={{ layout: "print" }}
              user={collaborationUser}
              layoutEngineOptions={{
                flowMode: "paginated",
                trackedChanges: { mode: "final", enabled: false },
              }}
              comments={{ visible: false }}
              trackChanges={{ visible: false }}
              onReady={(event) => {
                console.log("[Doc] onReady 触发");
                superdocRef.current = event.superdoc;

                if (collabRuntime && !upgradedRef.current) {
                  upgradedRef.current = true;
                  event.superdoc
                    .upgradeToCollaboration({
                      ydoc: collabRuntime.ydoc,
                      provider: collabRuntime.providerAdapter,
                    })
                    .then(() => {
                      console.log("[Doc] 协作模式已由本地编辑器升级");
                    })
                    .catch((e: Error) => {
                      console.error("[Doc] upgradeToCollaboration 失败:", e);
                    });
                }

                event.superdoc.setZoom(zoomPercent);
                event.superdoc.setTrackedChangesPreferences({
                  mode: "final",
                  enabled: false,
                });
                onReadyStateChange?.(true);
                onRegisterExporter?.(exportCurrentDocx);
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
          ) : (
            <div className={styles.loading}>正在进入协作房间…</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
