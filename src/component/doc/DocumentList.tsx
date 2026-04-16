import type { DocumentInfo } from "@/src/api/docApi";
import styles from "./DocumentList.module.css";

interface DocumentListProps {
  documents: DocumentInfo[];
  onSelectDocument: (doc: DocumentInfo) => void;
  onDeleteDocument: (id: string, fileName: string) => void;
  onClose: () => void;
}

export default function DocumentList({
  documents,
  onSelectDocument,
  onDeleteDocument,
  onClose,
}: DocumentListProps) {
  const handleDelete = (doc: DocumentInfo) => {
    if (confirm(`确定要删除 "${doc.originalName}" 吗?`)) {
      onDeleteDocument(doc.id, doc.originalName);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>已上传文件列表</h3>
        <button onClick={onClose} className={styles.closeButton}>
          ×
        </button>
      </div>

      {documents.length === 0 ? (
        <p className={styles.message}>暂无文件</p>
      ) : (
        <ul className={styles.list}>
          {documents.map((doc) => (
            <li key={doc.id} className={styles.item}>
              <span
                onClick={() => onSelectDocument(doc)}
                className={styles.fileName}
              >
                {doc.originalName}
                <span className={styles.fileSize}>
                  ({(doc.size / 1024).toFixed(1)} KB)
                </span>
              </span>
              <button
                onClick={() => handleDelete(doc)}
                className={styles.deleteButton}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
