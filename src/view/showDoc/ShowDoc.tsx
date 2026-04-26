import { useRef, useState, useCallback, useEffect } from "react";
import { DocumentList, DocumentViewer } from "@/component";
import {
  cleanupDocuments,
  deleteDocument,
  findText,
  getDocumentList,
  getDocumentSeed,
  getDocumentUrl,
  openDocumentSession,
  replaceText,
  uploadDocuments,
} from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";
import styles from "./showDoc.module.css";

type FileUploadProps = {
  maxSize?: number;
};

export default function ShowDoc({ maxSize = 10 }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileIdsRef = useRef<Set<string>>(new Set());

  const [currentDoc, setCurrentDoc] = useState<DocumentInfo | null>(null);
  const [currentDocumentBlob, setCurrentDocumentBlob] = useState<Blob | null>(
    null
  );
  const [fileList, setFileList] = useState<DocumentInfo[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [showList, setShowList] = useState(false);
  const [docKey, setDocKey] = useState(0);

  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findPattern, setFindPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [findResult, setFindResult] = useState<{
    success: boolean;
    count: number;
    positions: Array<{ index: number; text: string; ref: string }>;
  } | null>(null);
  const [replaceResult, setReplaceResult] = useState<{
    success: boolean;
    replaced?: number;
    message?: string;
  } | null>(null);
  const [testStatus, setTestStatus] = useState("");
  const [currentDocId, setCurrentDocId] = useState<string>("");

  const refreshDocumentList = useCallback(async () => {
    const res = await getDocumentList();
    if (res.success) {
      setFileList(res.documents);
    }
  }, []);

  const openAndLoadDocument = useCallback(
    async (docId: string) => {
      // 1. 获取协作房间信息
      const openRes = await openDocumentSession(docId);
      if (!openRes.success || !openRes.document) {
        throw new Error("打开文档失败");
      }

      // 2. 获取文件原始内容（播种用）
      const seedBlob = await getDocumentSeed(docId);

      setCurrentDoc(openRes.document);
      setCurrentDocumentBlob(seedBlob);
      setCurrentDocId(openRes.document.id);
      setDocKey((prev) => prev + 1);
    },
    []
  );

  useEffect(() => {
    void refreshDocumentList();
  }, [refreshDocumentList]);

  // ===== 页面卸载时清理 =====
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const file = files[0];
    const fileName = file.name;

    const isValid =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.toLowerCase().endsWith(".docx");

    if (!isValid) {
      setErrorMessage("请选择 .docx 文件");
      event.target.value = "";
      return;
    }

    if (file.size > maxSize * 1024 * 1024) {
      setErrorMessage(`最大支持 ${maxSize}MB`);
      event.target.value = "";
      return;
    }

    setErrorMessage("");
    setUploadStatus(`正在上传: ${fileName}`);

    try {
      const uploadRes = await uploadDocuments([file]);
      const uploaded = uploadRes.files?.[0];
      if (!uploadRes.success || !uploaded) {
        throw new Error("上传接口返回异常");
      }

      uploadedFileIdsRef.current.add(uploaded.id);

      // 只刷新列表，不自动打开
      await refreshDocumentList();

      setUploadStatus(`上传成功: ${uploaded.originalName}, 请点击列表打开`);
    } catch (error: any) {
      setUploadStatus(`上传失败: ${fileName}`);
      setErrorMessage(error.message || "上传失败");
    } finally {
      event.target.value = "";
    }
  };

  const handleDeleteDocument = useCallback(
    async (id: string, _fileName: string) => {
      try {
        await deleteDocument(id);
        if (currentDoc?.id === id) {
          setCurrentDoc(null);
          setCurrentDocumentBlob(null);
          setCurrentDocId("");
        }
        await refreshDocumentList();
        setUploadStatus("文件已删除");
      } catch {
        setErrorMessage("删除失败");
      }
    },
    [currentDoc?.id, refreshDocumentList]
  );

  const handleSelectDocument = useCallback(
    async (doc: DocumentInfo) => {
      try {
        setUploadStatus(`正在打开: ${doc.originalName}`);
        await openAndLoadDocument(doc.id);
        setUploadStatus(`已打开: ${doc.originalName}`);
      } catch (error: any) {
        setErrorMessage(error.message || "打开文档失败");
      } finally {
        setShowList(false);
      }
    },
    [openAndLoadDocument]
  );

  const handleDownload = () => {
    if (!currentDoc || !currentDocumentBlob) {
      return;
    }

    const url = URL.createObjectURL(currentDocumentBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = currentDoc.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setCurrentDoc(null);
    setCurrentDocumentBlob(null);
    setCurrentDocId("");
  };

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
    } catch (error: any) {
      setTestStatus("查找失败: " + error.message);
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
      setTestStatus(result.success ? "替换完成 (1处)" : "替换失败: " + result.message);
    } catch (error: any) {
      setTestStatus("替换失败: " + error.message);
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
      setTestStatus(
        result.success ? `替换完成 (${result.replaced}处)` : "替换失败: " + result.message
      );
    } catch (error: any) {
      setTestStatus("替换失败: " + error.message);
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
              <button onClick={() => setShowList(true)} className={styles.uploadButton}>
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

          {showFindReplace && (
            <div
              style={{
                padding: "16px",
                margin: "12px 0",
                backgroundColor: "#f5f5f5",
                borderRadius: "8px",
                border: "1px solid #ddd",
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>查找替换测试</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ width: "80px" }}>文档ID:</label>
                  <input
                    type="text"
                    value={currentDocId}
                    onChange={(e) => setCurrentDocId(e.target.value)}
                    placeholder="输入文档ID"
                    style={{
                      flex: 1,
                      padding: "6px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!currentDoc) return;
                      setCurrentDocId(currentDoc.id);
                      setTestStatus(`已设置文档ID: ${currentDoc.id}`);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      cursor: "pointer",
                    }}
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
                    style={{
                      flex: 1,
                      padding: "6px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <label style={{ width: "80px" }}>替换为:</label>
                  <input
                    type="text"
                    value={replaceWith}
                    onChange={(e) => setReplaceWith(e.target.value)}
                    placeholder="输入替换内容"
                    style={{
                      flex: 1,
                      padding: "6px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleFind}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: "#2196F3",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    查找
                  </button>
                  <button
                    onClick={handleReplaceFirst}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: "#FF9800",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    替换第一个
                  </button>
                  <button
                    onClick={handleReplaceAll}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "4px",
                      border: "none",
                      backgroundColor: "#f44336",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    替换全部
                  </button>
                </div>
                {testStatus && (
                  <p
                    style={{
                      margin: "8px 0 0 0",
                      padding: "8px",
                      backgroundColor: "#e8f5e9",
                      borderRadius: "4px",
                    }}
                  >
                    {testStatus}
                  </p>
                )}
                {findResult && (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "8px",
                      backgroundColor: "#e3f2fd",
                      borderRadius: "4px",
                    }}
                  >
                    <strong>查找结果:</strong> 找到 {findResult.count} 处匹配
                    {findResult.positions.length > 0 && (
                      <ul
                        style={{
                          margin: "8px 0 0 0",
                          paddingLeft: "20px",
                          fontSize: "12px",
                        }}
                      >
                        {findResult.positions.slice(0, 5).map((pos, index) => (
                          <li key={index}>
                            [{pos.index}] {pos.text.substring(0, 50)}...
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {replaceResult && (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "8px",
                      backgroundColor: replaceResult.success ? "#fff3e0" : "#ffebee",
                      borderRadius: "4px",
                    }}
                  >
                    <strong>替换结果:</strong>{" "}
                    {replaceResult.success
                      ? `已替换 ${replaceResult.replaced ?? 0} 处`
                      : `失败：${replaceResult.message ?? "未知错误"}`}
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

          {currentDoc && currentDocumentBlob ? (
            <DocumentViewer
              fileName={currentDoc.originalName}
              documentData={currentDocumentBlob}
              docId={currentDoc.roomName || currentDoc.id}
              collaborationWsUrl={currentDoc.collaboration?.wsUrl}
              docKey={docKey}
              onDownload={handleDownload}
              onClear={handleClear}
            />
          ) : (
            !showList && <div className={styles.placeholder}>请上传 DOC 文件</div>
          )}
        </div>
      </div>
    </main>
  );
}
