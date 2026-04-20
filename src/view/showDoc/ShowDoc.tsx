import { useRef, useState, useCallback, useEffect } from "react";
import { DocumentList, DocumentViewer } from "@/component";
import { fileStore } from "@/store/fileStore";
import { cleanupDocuments, getDocumentList, findText, replaceText, getDocumentText } from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import styles from "./showDoc.module.css";

type FileUploadProps = {
  maxSize?: number;
};

export default function ShowDoc({ maxSize = 10 }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [showList, setShowList] = useState(false);
  const [docKey, setDocKey] = useState(0);
  const [fileList, setFileList] = useState<DocumentInfo[]>(
    fileStore.getFileList()
  );
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());

  // 查找替换测试相关状态
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findPattern, setFindPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [findResult, setFindResult] = useState<{ success: boolean; count: number; positions: any[] } | null>(null);
  const [replaceResult, setReplaceResult] = useState<{ success: boolean; replaced?: number; message?: string } | null>(null);
  const [testStatus, setTestStatus] = useState("");
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = fileStore.subscribe(() => {
      setFileList(fileStore.getFileList());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    getDocumentList().then((res) => {
      if (res.success) {
        res.documents.forEach((doc) => {
          fileStore.setUploadedId(doc.originalName, doc.id);
        });
        fileStore.setServerFileList(res.documents);
        setFileList(res.documents);
      }
    });
  }, []);

  useEffect(() => {
    const eventSource = new EventSource(
      "http://localhost:3000/api/docs/events"
    );

    eventSource.addEventListener("file_updated", async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.fileId && data.fileName) {
          const res = await fetch(
            `http://localhost:3000/api/docs/${data.fileId}`
          );
          const blob = await res.blob();
          fileStore.updateFileFromServer(data.fileName, blob);
          if (currentFileName === data.fileName) {
            setDocKey((prev) => prev + 1);
          }
          setUploadStatus(`文件已更新: ${data.fileName}`);
        }
      } catch (error) {
        console.error("处理文件更新失败:", error);
      }
    });

    eventSource.addEventListener("file_deleted", async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.fileId && data.fileName) {
          fileStore.removeFileById(data.fileId);
          if (currentFileName === data.fileName) {
            setCurrentFileName(null);
          }
          const res = await getDocumentList();
          if (res.success) {
            fileStore.setServerFileList(res.documents);
            setFileList(res.documents);
          }
          setUploadStatus(`文件已删除: ${data.fileName}`);
        }
      } catch (error) {
        console.error("处理文件删除失败:", error);
      }
    });

    eventSource.onerror = () => {
      console.log("SSE 连接断开，将自动重连");
    };

    return () => eventSource.close();
  }, [currentFileName]);

  useEffect(() => {
    const handleBeforeUnload = async () => {
      const keepIds = Array.from(uploadedFileIdsRef.current);
      if (keepIds.length > 0) {
        await cleanupDocuments(keepIds);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    const fileName = file.name;

    const isValid =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.toLowerCase().endsWith(".docx");

    if (!isValid) {
      setErrorMessage("请选择 .docx 文件");
      e.target.value = "";
      return;
    }

    if (file.size > maxSize * 1024 * 1024) {
      setErrorMessage(`最大支持 ${maxSize}MB`);
      e.target.value = "";
      return;
    }

    if (fileStore.hasFile(fileName)) {
      setErrorMessage(`文件 "${fileName}" 已存在，禁止重复上传`);
      e.target.value = "";
      return;
    }

    fileStore.addFile(fileName, file);
    setCurrentFileName(fileName);
    setErrorMessage("");
    e.target.value = "";

    setUploadStatus(`正在上传: ${fileName}`);
    const result = await fileStore.uploadFile(file);
    if (result.success && result.fileId) {
      uploadedFileIdsRef.current.add(result.fileId);
      setUploadStatus(`上传成功: ${fileName}`);
    } else {
      setUploadStatus(`上传失败: ${fileName}`);
    }
  };

  const handleDeleteDocument = useCallback(
    async (id: string, fileName: string) => {
      const success = await fileStore.deleteFile(id, fileName);
      if (success) {
        if (currentFileName === fileName) {
          setCurrentFileName(null);
        }
        setUploadStatus("文件已删除");
      } else {
        setErrorMessage("删除失败");
      }
    },
    [currentFileName]
  );

  const handleSelectDocument = useCallback((doc: DocumentInfo) => {
    if (fileStore.hasFile(doc.originalName)) {
      setCurrentFileName(doc.originalName);
      setDocKey((prev) => prev + 1);
    }
    setShowList(false);
  }, []);

  const handleDownload = () => {
    if (currentFileName) {
      const blob = fileStore.getFile(currentFileName);
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

  // 查找/替换测试函数
  const handleFind = async () => {
    if (!currentDocId || !findPattern.trim()) {
      setTestStatus("请先选择文档并输入要查找的内容");
      return;
    }
    setTestStatus("正在查找...");
    try {
      const result = await findText(currentDocId, findPattern);
      setFindResult(result);
      setReplaceResult(null);
      setTestStatus(`找到 ${result.count} 处匹配`);
    } catch (e: any) {
      setTestStatus("查找失败: " + e.message);
    }
  };

  const handleReplaceFirst = async () => {
    if (!currentDocId || !findPattern.trim() || !replaceWith.trim()) {
      setTestStatus("请输入查找内容和替换内容");
      return;
    }
    setTestStatus("正在替换第一个匹配...");
    try {
      const result = await replaceText(currentDocId, findPattern, replaceWith, false);
      setReplaceResult(result);
      setTestStatus(result.success ? `替换完成 (1处)` : "替换失败: " + result.message);
    } catch (e: any) {
      setTestStatus("替换失败: " + e.message);
    }
  };

  const handleReplaceAll = async () => {
    if (!currentDocId || !findPattern.trim() || !replaceWith.trim()) {
      setTestStatus("请输入查找内容和替换内容");
      return;
    }
    setTestStatus("正在替换所有匹配...");
    try {
      const result = await replaceText(currentDocId, findPattern, replaceWith, true);
      setReplaceResult(result);
      setTestStatus(result.success ? `替换完成 (${result.replaced}处)` : "替换失败: " + result.message);
    } catch (e: any) {
      setTestStatus("替换失败: " + e.message);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <div>
              <h1 className={styles.title}>DOCX 预览</h1>
              <p className={styles.tip}>仅支持 .docx 文件</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                className={styles.uploadButton}
              >
                选择文件
              </button>
              <button
                onClick={() => setShowList(true)}
                className={styles.uploadButton}
              >
                文件列表
              </button>
              <button
                onClick={() => setShowFindReplace(!showFindReplace)}
                className={styles.uploadButton}
                style={{ backgroundColor: showFindReplace ? "#4CAF50" : undefined }}
              >
                查找替换
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

          {/* 查找替换测试面板 */}
          {showFindReplace && (
            <div style={{
              padding: "16px",
              margin: "12px 0",
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              border: "1px solid #ddd"
            }}>
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>查找替换测试</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ width: "80px" }}>文档ID:</label>
                  <input
                    type="text"
                    value={currentDocId || ""}
                    onChange={(e) => setCurrentDocId(e.target.value)}
                    placeholder="输入文档ID"
                    style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                  />
                  <button
                    onClick={async () => {
                      // 获取当前文档对应的服务器ID
                      const res = await getDocumentList();
                      if (res.success && res.documents.length > 0) {
                        // 使用第一个文档的ID作为示例
                        setCurrentDocId(res.documents[0].id);
                        setTestStatus(`已设置文档ID: ${res.documents[0].id}`);
                      }
                    }}
                    style={{ padding: "6px 12px", borderRadius: "4px", border: "1px solid #ccc", cursor: "pointer" }}
                  >
                    使用当前文档
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ width: "80px" }}>查找:</label>
                  <input
                    type="text"
                    value={findPattern}
                    onChange={(e) => setFindPattern(e.target.value)}
                    placeholder="输入要查找的内容"
                    style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ width: "80px" }}>替换为:</label>
                  <input
                    type="text"
                    value={replaceWith}
                    onChange={(e) => setReplaceWith(e.target.value)}
                    placeholder="输入替换内容"
                    style={{ flex: 1, padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleFind}
                    style={{ padding: "8px 16px", borderRadius: "4px", border: "none", backgroundColor: "#2196F3", color: "white", cursor: "pointer" }}
                  >
                    查找
                  </button>
                  <button
                    onClick={handleReplaceFirst}
                    style={{ padding: "8px 16px", borderRadius: "4px", border: "none", backgroundColor: "#FF9800", color: "white", cursor: "pointer" }}
                  >
                    替换第一个
                  </button>
                  <button
                    onClick={handleReplaceAll}
                    style={{ padding: "8px 16px", borderRadius: "4px", border: "none", backgroundColor: "#f44336", color: "white", cursor: "pointer" }}
                  >
                    替换全部
                  </button>
                </div>
                {testStatus && (
                  <p style={{ margin: "8px 0 0 0", padding: "8px", backgroundColor: "#e8f5e9", borderRadius: "4px" }}>
                    {testStatus}
                  </p>
                )}
                {findResult && (
                  <div style={{ marginTop: "8px", padding: "8px", backgroundColor: "#e3f2fd", borderRadius: "4px" }}>
                    <strong>查找结果:</strong> 找到 {findResult.count} 处匹配
                    {findResult.positions.length > 0 && (
                      <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px", fontSize: "12px" }}>
                        {findResult.positions.slice(0, 5).map((pos, i) => (
                          <li key={i}>[{pos.index}] {pos.text.substring(0, 50)}...</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {showList && (
            <DocumentList
              documents={fileList}
              onSelectDocument={handleSelectDocument}
              onDeleteDocument={handleDeleteDocument}
              onClose={() => setShowList(false)}
            />
          )}

          {currentFileName && fileStore.getFile(currentFileName) ? (
            <DocumentViewer
              fileName={currentFileName}
              documentData={fileStore.getFile(currentFileName)!}
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
