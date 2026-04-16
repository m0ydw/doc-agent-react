import { Doc } from "@/src/component/index";
import styles from "./DocumentViewer.module.css";

interface DocumentViewerProps {
  fileName: string;
  documentData: Blob;
  docKey: number;
  onDownload: () => void;
  onClear: () => void;
}

export default function DocumentViewer({
  fileName,
  documentData,
  docKey,
  onDownload,
  onClear,
}: DocumentViewerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>当前文件: {fileName}</div>
      <Doc key={docKey} documentData={documentData} />
      <div className={styles.actions}>
        <button onClick={onDownload} className={styles.button}>
          下载文件
        </button>
        <button onClick={onClear} className={styles.button}>
          清除
        </button>
      </div>
    </div>
  );
}
