import { useRef, useState, useCallback, useEffect } from "react";
import { DocumentList, DocumentViewer } from "@/src/component/index";
import { uploadDocuments, getDocumentList, deleteDocument } from "@/src/api/docApi";
import type { DocumentInfo } from "@/src/api/docApi";
import styles from "./showDoc.module.css";

type FileUploadProps = {
  maxSize?: number;
};

export default function ShowDoc({ maxSize = 10 }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localFiles, setLocalFiles] = useState<Map<string, Blob>>(new Map());
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [showList, setShowList] = useState(false);
  const [docKey, setDocKey] = useState(0);

  useEffect(() => {
    const eventSource = new EventSource("http://localhost:3000/api/docs/events");

    eventSource.addEventListener("file_updated", async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.fileId && data.fileName) {
          const res = await fetch(`http://localhost:3000/api/docs/${data.fileId}`);
          const blob = await res.blob();
          setLocalFiles(prev => {
            const newMap = new Map(prev);
            newMap.set(data.fileName, blob);
            return newMap;
          });
          if (currentFileName === data.fileName) {
            setDocKey(prev => prev + 1);
          }
          setUploadStatus(`文件已更新: ${data.fileName}`);
        }
      } catch (error) {
        console.error("处理文件更新失败:", error);
      }
    });

    eventSource.onerror = () => {
      console.log("SSE 连接断开，将自动重连");
    };

    return () => eventSource.close();
  }, [currentFileName]);

  const fetchDocumentList = useCallback(async () => {
    try {
      const response = await getDocumentList();
      if (response.success) {
        setShowList(true);
      }
    } catch (error) {
      console.error("获取文件列表失败:", error);
      setErrorMessage("获取文件列表失败");
    }
  }, []);

  const uploadSingleFile = useCallback(async (file: File): Promise<boolean> => {
    try {
      setUploadStatus(`正在上传: ${file.name}`);
      const response = await uploadDocuments([file]);
      if (response.success) {
        setUploadStatus(`上传成功: ${file.name}`);
        await fetchDocumentList();
        return true;
      } else {
        setErrorMessage(response.message || `上传失败: ${file.name}`);
        return false;
      }
    } catch (error) {
      console.error("上传失败:", error);
      setErrorMessage(`上传失败: ${file.name}`);
      return false;
    }
  }, [fetchDocumentList]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    const fileName = file.name;

    const isValid =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.toLowerCase().endsWith(".docx") ||
      fileName.toLowerCase().endsWith(".doc");

    if (!isValid) {
      setErrorMessage("请选择 .doc 或 .docx 文件");
      e.target.value = "";
      return;
    }

    if (file.size > maxSize * 1024 * 1024) {
      setErrorMessage(`最大支持 ${maxSize}MB`);
      e.target.value = "";
      return;
    }

    if (localFiles.has(fileName)) {
      setErrorMessage(`文件 "${fileName}" 已存在，禁止重复上传`);
      e.target.value = "";
      return;
    }

    setLocalFiles(prev => {
      const newMap = new Map(prev);
      newMap.set(fileName, file);
      return newMap;
    });
    setCurrentFileName(fileName);
    setErrorMessage("");
    e.target.value = "";

    await uploadSingleFile(file);
  };

  const handleDeleteDocument = useCallback(async (id: string, fileName: string) => {
    try {
      await deleteDocument(id);
      setLocalFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileName);
        return newMap;
      });
      if (currentFileName === fileName) {
        setCurrentFileName(null);
      }
      await fetchDocumentList();
      setUploadStatus("文件已删除");
    } catch (error) {
      console.error("删除失败:", error);
      setErrorMessage("删除失败");
    }
  }, [currentFileName, fetchDocumentList]);

  const handleSelectDocument = useCallback(async (doc: DocumentInfo) => {
    setUploadStatus(`加载中: ${doc.originalName}...`);
    try {
      const res = await fetch(`http://localhost:3000/api/docs/${doc.id}`);
      const blob = await res.blob();
      setLocalFiles(prev => {
        const newMap = new Map(prev);
        newMap.set(doc.originalName, blob);
        return newMap;
      });
      setCurrentFileName(doc.originalName);
      setDocKey(prev => prev + 1);
      setShowList(false);
    } catch (error) {
      console.error("加载文件失败:", error);
      setErrorMessage("加载文件失败");
    }
  }, []);

  const handleDownload = () => {
    if (currentFileName) {
      const blob = localFiles.get(currentFileName);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = currentFileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const handleClear = () => {
    setCurrentFileName(null);
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <div>
              <h1 className={styles.title}>DOCX 预览</h1>
              <p className={styles.tip}>仅支持 .doc 和 .docx 文件</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => fileInputRef.current?.click()} className={styles.uploadButton}>
                选择文件
              </button>
              <button onClick={fetchDocumentList} className={styles.uploadButton}>
                文件列表
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".doc,.docx"
            onChange={handleFileChange}
            className={styles.hiddenInput}
          />

          {uploadStatus && <p className={styles.tip}>{uploadStatus}</p>}
          {errorMessage && <p className={styles.errorTip}>{errorMessage}</p>}

          {showList && (
            <DocumentList
              onSelectDocument={handleSelectDocument}
              onDeleteDocument={handleDeleteDocument}
              onClose={() => setShowList(false)}
            />
          )}

          {currentFileName && localFiles.get(currentFileName) ? (
            <DocumentViewer
              fileName={currentFileName}
              documentData={localFiles.get(currentFileName)!}
              docKey={docKey}
              onDownload={handleDownload}
              onClear={handleClear}
            />
          ) : (
            !showList && (
              <div className={styles.placeholder}>请上传 DOC 文件</div>
            )
          )}
        </div>
      </div>
    </main>
  );
}
