import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { SuperDocModules } from "@superdoc-dev/react";

interface CollabRuntime {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  providerAdapter: {
    awareness?: unknown;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
    disconnect(): void;
    destroy(): void;
    synced: boolean;
    isSynced: boolean;
  };
  modules: SuperDocModules;
}

function createCollabRuntime(docId: string, wsUrl: string): CollabRuntime {
  const ydoc = new Y.Doc();
  const provider = new WebsocketProvider(wsUrl, docId, ydoc);

  const providerAdapter = {
    awareness: provider.awareness ?? undefined,
    on: (event: string, handler: (...args: unknown[]) => void) =>
      provider.on(event, handler),
    off: (event: string, handler: (...args: unknown[]) => void) =>
      provider.off(event, handler),
    disconnect: () => provider.disconnect(),
    destroy: () => provider.destroy(),
    get synced() {
      return provider.synced;
    },
    get isSynced() {
      return provider.synced;
    },
  };

  return {
    ydoc,
    provider,
    providerAdapter,
    modules: {
      collaboration: { ydoc, provider: providerAdapter },
    },
  };
}

export function useCollabConnection(
  docId: string | undefined,
  wsUrl: string
): { runtime: CollabRuntime | null; isReady: boolean } {
  const runtimeRef = useRef<CollabRuntime | null>(null);
  const currentDocIdRef = useRef<string | undefined>(docId);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!docId) {
      // DocId 变为空 → 销毁旧连接
      if (runtimeRef.current) {
        runtimeRef.current.provider.destroy();
        runtimeRef.current.ydoc.destroy();
        runtimeRef.current = null;
        setIsReady(false);
      }
      currentDocIdRef.current = undefined;
      return;
    }

    // Same docId → 复用
    if (currentDocIdRef.current === docId && runtimeRef.current) {
      return;
    }

    // Different docId → 销毁旧连接，创建新连接
    if (runtimeRef.current) {
      runtimeRef.current.provider.destroy();
      runtimeRef.current.ydoc.destroy();
      runtimeRef.current = null;
      setIsReady(false);
    }

    const runtime = createCollabRuntime(docId, wsUrl);
    runtimeRef.current = runtime;
    currentDocIdRef.current = docId;

    // 组合事件监听：sync + status，确保可靠检测
    const handleSync = (synced: boolean) => {
      console.log("[useCollabConnection] sync:", synced);
      if (synced) setIsReady(true);
    };

    const handleStatus = (event: { status: string }) => {
      console.log("[useCollabConnection] status:", event.status);
      if (event.status === "connected" && runtime.provider.synced) {
        setIsReady(true);
      }
    };

    runtime.provider.on("sync", handleSync);
    runtime.provider.on("status", handleStatus);

    // 如果是已经 synced 的状态（重连场景），立即设置
    if (runtime.provider.synced) {
      setIsReady(true);
    }

    return () => {
      runtime.provider.off("sync", handleSync);
      runtime.provider.off("status", handleStatus);
      runtime.provider.destroy();
      runtime.ydoc.destroy();
      runtimeRef.current = null;
      setIsReady(false);
    };
  }, [docId, wsUrl]);

  return {
    runtime: runtimeRef.current && isReady ? runtimeRef.current : null,
    isReady,
  };
}

export type { CollabRuntime };
