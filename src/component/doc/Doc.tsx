import { SuperDocEditor } from "@superdoc-dev/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SuperDocInstance, SuperDocModules } from "@superdoc-dev/react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import "@superdoc-dev/react/style.css";
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

type CollaborationRuntime = {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  providerAdapter: {
    awareness?: object;
    on?: (event: string, handler: Function) => void;
    off?: (event: string, handler: Function) => void;
    disconnect?: () => void;
    destroy?: () => void;
    synced?: boolean;
    isSynced?: boolean;
  };
  modules: SuperDocModules;
};

function createCollabRuntime(
  docId: string,
  wsUrl: string
): CollaborationRuntime {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: wsUrl,
    name: docId,
    document: ydoc,
  });

  const providerAdapter = {
    awareness: provider.awareness ?? undefined,
    on: (event: string, handler: Function) =>
      provider.on(event as any, handler as any),
    off: (event: string, handler: Function) =>
      (provider as any).off?.(event as any, handler as any),
    disconnect: () => (provider as any).disconnect?.(),
    destroy: () => provider.destroy(),
    synced: (provider as any).synced,
    isSynced: (provider as any).isSynced,
  };

  return {
    ydoc,
    provider,
    providerAdapter,
    modules: {
      collaboration: {
        ydoc,
        provider: providerAdapter,
      },
    },
  };
}

export default function Doc({
  documentData,
  docId,
  collaborationWsUrl = "ws://localhost:1234",
  onLoadError,
  onReadyStateChange,
  onPaginationChange,
  onRegisterExporter,
  zoomPercent = 114,
}: DocProps) {
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const [collabRuntime, setCollabRuntime] =
    useState<CollaborationRuntime | null>(null);

  const collaborationUser = useMemo(
    () => ({
      name: "Web",
      email: `web-${Math.random().toString(36).slice(2)}@local`,
    }),
    []
  );

  useEffect(() => {
    if (!docId) {
      setCollabRuntime(null);
      return;
    }

    console.log(
      "[Doc] 初始化协作运行时, room:",
      docId,
      "ws:",
      collaborationWsUrl
    );
    const runtime = createCollabRuntime(docId, collaborationWsUrl);

    runtime.provider.on("status", (event: { status: string }) => {
      console.log("[Doc] Hocuspocus 状态:", event.status);
    });
    runtime.provider.on("sync", (synced: boolean) => {
      console.log("[Doc] Hocuspocus 同步:", synced);
    });
    runtime.provider.on("connect", () => {
      console.log("[Doc] Hocuspocus 已连接");
    });
    runtime.provider.on("disconnect", () => {
      console.log("[Doc] Hocuspocus 已断开");
    });
    runtime.provider.on("error", (error: Error) => {
      console.log("[Doc] Hocuspocus 错误:", error.message);
    });

    setCollabRuntime(runtime);

    return () => {
      console.log("[Doc] 销毁协作运行时, room:", docId);
      runtime.provider.destroy();
      runtime.ydoc.destroy();
      setCollabRuntime(null);
    };
  }, [docId, collaborationWsUrl]);

  const exportCurrentDocx = async (): Promise<Blob | null> => {
    if (!superdocRef.current) return null;

    const result = await superdocRef.current.export({
      exportType: ["docx"],
      triggerDownload: false,
      isFinalDoc: true,
    });

    return result instanceof Blob ? result : null;
  };

  const shouldWaitForCollaboration = Boolean(docId) && !collabRuntime;

  return (
    <div className={styles.viewerShell}>
      {documentData ? (
        <div className={styles.editorRoot}>
          {shouldWaitForCollaboration ? (
            <div className={styles.loading}>正在初始化协作连接...</div>
          ) : (
            <SuperDocEditor
              document={documentData}
              format="docx"
              documentMode="viewing"
              role="viewer"
              contained={false}
              viewOptions={{ layout: "print" }}
              user={collaborationUser}
              layoutEngineOptions={{
                flowMode: "paginated",
                trackedChanges: { mode: "final", enabled: false } as object,
              }}
              comments={{ visible: false }}
              trackChanges={{ visible: false }}
              // modules={collabRuntime?.modules}
              onReady={(event) => {
                console.log("[Doc] onReady 触发");
                superdocRef.current = event.superdoc;

                // 防守式补偿：若插件未在初始化阶段挂载，升级到协作模式。
                if (
                  docId &&
                  collabRuntime &&
                  !event.superdoc.ydoc &&
                  typeof (event.superdoc as any).upgradeToCollaboration ===
                    "function"
                ) {
                  void (event.superdoc as any).upgradeToCollaboration({
                    ydoc: collabRuntime.ydoc,
                    provider: collabRuntime.providerAdapter,
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
          )}
        </div>
      ) : null}
    </div>
  );
}
