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
    get synced() { return (provider as any).synced; },
    get isSynced() { return (provider as any).isSynced; },
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
  const upgradedRef = useRef(false);
  const [collabRuntime, setCollabRuntime] =
    useState<CollaborationRuntime | null>(null);
  const runtimeRef = useRef<{ runtime: CollaborationRuntime; docId: string } | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountCountRef = useRef(0);

  function destroyRuntime() {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (runtimeRef.current) {
      console.log("[Doc] 销毁协作运行时, room:", runtimeRef.current.docId);
      runtimeRef.current.runtime.provider.destroy();
      runtimeRef.current.runtime.ydoc.destroy();
      runtimeRef.current = null;
    }
    setCollabRuntime(null);
    mountCountRef.current = 0;
  }

  const collaborationUser = useMemo(
    () => ({
      name: "Web",
      email: `web-${Math.random().toString(36).slice(2)}@local`,
    }),
    []
  );

  useEffect(() => {
    if (!docId) {
      destroyRuntime();
      return;
    }

    // 记录本次挂载的序号
    const mountId = ++mountCountRef.current;

    // 复用已有的同名 runtime（处理 StrictMode 二次挂载）
    if (runtimeRef.current && runtimeRef.current.docId === docId) {
      return;
    }

    // docId 变化 → 销毁旧 runtime
    if (runtimeRef.current && runtimeRef.current.docId !== docId) {
      destroyRuntime();
    }

    // 创建新 runtime
    const runtime = createCollabRuntime(docId, collaborationWsUrl);
    runtimeRef.current = { runtime, docId };

    // 仅通过 sync 事件激活协作
    runtime.provider.on("sync", (synced: boolean) => {
      console.log("[Doc] Hocuspocus 同步:", synced);
      if (synced) {
        setCollabRuntime(runtime);
        console.log("[Doc] 协作运行时已就绪");
      }
    });

    runtime.provider.on("status", (event: { status: string }) => {
      console.log("[Doc] Hocuspocus 状态:", event.status);
    });

    runtime.provider.on("disconnect", () => {
      console.log("[Doc] Hocuspocus 已断开");
    });

    runtime.provider.on("error", (error: Error) => {
      console.log("[Doc] Hocuspocus 错误:", error.message);
    });

    // 诊断性轮询：每500ms检查一次 provider 的同步状态
    const syncPoll = setInterval(() => {
      if ((runtime.provider as any).synced) {
        clearInterval(syncPoll);
        // 使用函数式更新，避免闭包问题
        setCollabRuntime(prev => {
          if (!prev) {
            console.log("[Doc] 轮询检测到 provider.synced，强制设置 runtime");
            return runtime;
          }
          return prev;
        });
      }
    }, 500);

    // 取消上一次的延时清理
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    return () => {
      clearInterval(syncPoll);
      // 只有当前挂载的序号与全局序号一致时，才真正销毁
      // StrictMode 二次挂载后 mountId 不会等于 mountCountRef.current
      cleanupTimerRef.current = setTimeout(() => {
        if (mountCountRef.current === mountId) {
          destroyRuntime();
        }
      }, 100);
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
                trackedChanges: { mode: "final", enabled: false } as object,
              }}
              comments={{ visible: false }}
              trackChanges={{ visible: false }}
              onReady={(event) => {
                console.log("[Doc] onReady 触发");
                superdocRef.current = event.superdoc;

                // 条件满足时升级协作：sync 已完成 + onReady 已触发
                if (collabRuntime && !upgradedRef.current) {
                  upgradedRef.current = true;
                  void (event.superdoc as any).upgradeToCollaboration({
                    ydoc: collabRuntime.ydoc,
                    provider: collabRuntime.providerAdapter,
                  });
                  console.log("[Doc] 协作模式已由本地编辑器升级");
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
