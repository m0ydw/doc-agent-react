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

  // 选择文件
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 只允许 docx
    const isValid =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");

    if (!isValid) {
      alert("请选择 .docx 文件");
      e.target.value = "";
      return;
    }

    // 大小限制
    if (file.size > maxSize * 1024 * 1024) {
      alert(`最大支持 ${maxSize}MB`);
      e.target.value = "";
      return;
    }

    setDocData(file);
    setFileName(file.name);
    setErrorMessage("");
    e.target.value = "";
  };

  // 打开文件选择
  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  // 下载文件
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 下载原始文件
  const handleDownload = () => {
    if (docData && fileName) download(docData, fileName);
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* 顶部：标题 + 上传 */}
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <div>
              <h1 className={styles.title}>DOCX 预览</h1>
              <p className={styles.tip}>仅支持 .docx 文件</p>
            </div>
            <button onClick={triggerUpload} className={styles.uploadButton}>
              选择文件
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            className={styles.hiddenInput}
          />

          {/* 错误提示 */}
          {errorMessage && <p className={styles.tip}>{errorMessage}</p>}

          {/* 文档预览 */}
          {docData ? (
            <>
              <Doc documentData={docData} />
              <button
                onClick={handleDownload}
                className={styles.uploadButton}
                style={{ marginTop: 16 }}
              >
                下载文件
              </button>
            </>
          ) : (
            <div className={styles.placeholder}>请上传 DOCX 文件</div>
          )}
        </div>
      </div>
    </main>
  );
}
