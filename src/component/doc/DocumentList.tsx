import { useState, useEffect } from "react";
import { getDocumentList } from "@/src/api/docApi";
import type { DocumentInfo } from "@/src/api/docApi";
import styles from "./DocumentList.module.css";

interface DocumentListProps {
  onSelectDocument: (doc: DocumentInfo) => void;
  onDeleteDocument: (id: string, fileName: string) => void;
  onClose: () => void;
}

export default function DocumentList({
  onSelectDocument,
  onDeleteDocument,
  onClose,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getDocumentList();
      if (response.success) {
        setDocuments(response.documents);
      } else {
        setError("获取文件列表失败");
      }
    } catch {
      setError("获取文件列表失败");
    } finally {
      setLoading(false);
    }
  };

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

      {loading ? (
        <p className={styles.message}>加载中...</p>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : documents.length === 0 ? (
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
