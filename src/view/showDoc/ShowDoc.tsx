import { useRef, useState } from "react";
import { Doc } from "@/src/component/index";
import styles from "./showDoc.module.css";

type FileUploadProps = {
  maxSize?: number;
};

export default function ShowDoc({ maxSize = 10 }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docData, setDocData] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDocReady, setIsDocReady] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [lastPaginationTime, setLastPaginationTime] = useState("");
  const [exporter, setExporter] = useState<(() => Promise<Blob | null>) | null>(null);
  const [zoomPercent, setZoomPercent] = useState(114);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validType =
      file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const validExt = file.name.toLowerCase().endsWith(".docx");

    if (!validType && !validExt) {
      alert("请选择有效的 .docx 文件。");
      e.target.value = "";
      return;
    }

    const maxSizeBytes = maxSize * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`文件大小不能超过 ${maxSize}MB。`);
      e.target.value = "";
      return;
    }

    setDocData(file);
    setFileName(file.name);
    setErrorMessage("");
    setIsDocReady(false);
    setTotalPages(0);
    setLastPaginationTime("");
    setExporter(null);
    e.target.value = "";
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const downloadBlob = (blob: Blob, targetName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = targetName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportRenderedDocx = async () => {
    if (!exporter || !fileName) return;
    const exported = await exporter();
    if (!exported) {
      setErrorMessage("导出失败：当前渲染实例不可用。");
      return;
    }

    const baseName = fileName.replace(/\.docx$/i, "");
    downloadBlob(exported, `${baseName}.superdoc-rendered.docx`);
  };

  const handleDownloadOriginal = () => {
    if (!docData || !fileName) return;
    downloadBlob(docData, fileName);
  };

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.meta}>
              <h1 className={styles.title}>DOCX 预览</h1>
              <p className={styles.tip}>
                基于 SuperDoc 渲染，仅支持上传 .docx（最大 {maxSize}MB）
              </p>
              {fileName ? <p className={styles.tip}>当前文件：{fileName}</p> : null}
            </div>
            <button type="button" onClick={triggerFileSelect} className={styles.uploadButton}>
              上传 DOCX 文件
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
            className={styles.hiddenInput}
          />

          {docData ? (
            <Doc
              key={`${fileName}-${zoomPercent}`}
              documentData={docData}
              onLoadError={(message) => setErrorMessage(`文档渲染失败：${message}`)}
              onReadyStateChange={(ready) => setIsDocReady(ready)}
              onPaginationChange={(pages) => {
                setTotalPages(pages);
                setLastPaginationTime(new Date().toLocaleTimeString());
              }}
              onRegisterExporter={(fn) => setExporter(() => fn)}
              zoomPercent={zoomPercent}
            />
          ) : (
            <div className={styles.placeholder}>请选择一个 .docx 文档，文档会在此区域完整渲染。</div>
          )}
          {errorMessage ? <p className={styles.tip}>{errorMessage}</p> : null}

          {docData ? (
            <section className={styles.debugPanel}>
              <h2 className={styles.debugTitle}>分页调试 / 对比面板</h2>
              <p className={styles.tip}>渲染状态：{isDocReady ? "已就绪" : "初始化中"}</p>
              <p className={styles.tip}>分页页数：{totalPages > 0 ? totalPages : "未获取到"}</p>
              <p className={styles.tip}>最近分页更新时间：{lastPaginationTime || "暂无"}</p>
              <p className={styles.tip}>
                当前配置：layout=print, flowMode=paginated, zoom={zoomPercent}%
              </p>
              <div className={styles.zoomRow}>
                <label htmlFor="zoomPercent" className={styles.tip}>
                  分页校准缩放（建议 112-118）：
                </label>
                <input
                  id="zoomPercent"
                  type="number"
                  min={80}
                  max={160}
                  value={zoomPercent}
                  onChange={(e) => setZoomPercent(Number(e.target.value) || 100)}
                  className={styles.zoomInput}
                />
              </div>
              <div className={styles.debugActions}>
                <button
                  type="button"
                  className={styles.uploadButton}
                  onClick={handleExportRenderedDocx}
                  disabled={!isDocReady || !exporter}
                >
                  导出 SuperDoc 渲染结果
                </button>
                <button
                  type="button"
                  className={styles.uploadButton}
                  onClick={handleDownloadOriginal}
                >
                  下载原始 DOCX
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
