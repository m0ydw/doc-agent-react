import { SuperDocEditor } from "@superdoc-dev/react";
import { useRef, useState, useEffect } from "react";
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
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  // 使用 state 管理 modules，以便在 provider 创建完成后触发重渲染
  const [modules, setModules] = useState<SuperDocModules | undefined>(
    undefined
  );

  // 使用 useEffect 管理 Yjs provider 生命周期
  useEffect(() => {
    if (!docId) {
      console.log("[Doc] 无 docId，不创建 Yjs");
      setModules(undefined);
      return;
    }

    console.log("[Doc] 创建 Yjs 模块, docId:", docId);

    // 创建 Yjs 文档
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    console.log("[Doc] ydoc 创建完成");

    // 创建 Hocuspocus Provider
    const provider = new HocuspocusProvider({
      url: "ws://localhost:1234",
      name: docId,
      document: ydoc,
    });
    providerRef.current = provider;

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

    // 监听 ydoc 变化并刷新内容
    ydoc.on("update", (update: Uint8Array) => {
      console.log("[Doc] ydoc 更新, 大小:", update.length);
      // 如果文档已就绪，延迟刷新内容
      if (superdocRef.current) {
        setTimeout(() => {
          const superdoc = superdocRef.current as any;
          if (superdoc && superdoc.setDocument) {
            console.log("[Doc] 尝试重新加载文档");
            // superdoc.setDocument({ ydoc });
          }
        }, 1000);
      }
    });

    console.log("[Doc] 设置 modules");

    setModules({
      collaboration: { ydoc, provider: provider as Object },
    } as SuperDocModules);

    // 清理函数：组件卸载或 docId 变化时销毁 provider 和 ydoc
    return () => {
      console.log("[Doc] 清理 Yjs 资源, docId:", docId);
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      setModules(undefined);
    };
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
