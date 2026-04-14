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
    e.target.value = "";
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
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
              key={fileName}
              documentData={docData}
              onLoadError={(message) => setErrorMessage(`文档渲染失败：${message}`)}
            />
          ) : (
            <div className={styles.placeholder}>请选择一个 .docx 文档，文档会在此区域完整渲染。</div>
          )}
          {errorMessage ? <p className={styles.tip}>{errorMessage}</p> : null}
        </div>
      </section>
    </main>
  );
}
