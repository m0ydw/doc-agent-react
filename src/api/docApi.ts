import axios from "axios";
import { config } from "@/config";

const API_BASE_URL = config.docsApiUrl;

export type CollaborationInfo = {
  docId: string;
  roomName: string;
  wsUrl: string;
};

export type DocumentInfo = {
  id: string;
  roomName: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  filePath: string;
  collaboration?: CollaborationInfo;
};

export type UploadResponse = {
  success: boolean;
  message: string;
  files: DocumentInfo[];
};

export type ListResponse = {
  success: boolean;
  documents: DocumentInfo[];
  total: number;
};

export const uploadDocuments = async (
  files: File[]
): Promise<UploadResponse> => {
  const formData = new FormData();
  files.forEach((file) => {
    const safeName = encodeURIComponent(file.name);
    formData.append("files", file, safeName);
  });

  const response = await axios.post<UploadResponse>(
    `${API_BASE_URL}/upload`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return response.data;
};

export const getDocumentList = async (): Promise<ListResponse> => {
  const response = await axios.get<ListResponse>(`${API_BASE_URL}/list`);
  return response.data;
};

export const getDocumentUrl = (id: string): string => {
  return `${API_BASE_URL}/${id}`;
};

// 获取文件原始内容（供播种用）
export const getDocumentSeed = async (id: string): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/${id}/seed`);
  if (!response.ok) {
    throw new Error(`获取种子文件失败: ${response.status}`);
  }
  return response.blob();
};

export const getDocumentInfo = async (
  id: string
): Promise<{ success: boolean; document: DocumentInfo }> => {
  const response = await axios.get(`${API_BASE_URL}/${id}/info`);
  return response.data;
};

export const openDocumentSession = async (
  id: string
): Promise<{ success: boolean; document: DocumentInfo }> => {
  const response = await axios.post(`${API_BASE_URL}/${id}/open`);
  return response.data;
};

export const deleteDocument = async (
  id: string
): Promise<{ success: boolean; message: string }> => {
  const response = await axios.delete(`${API_BASE_URL}/${id}`);
  return response.data;
};

export const cleanupDocuments = async (
  keepIds: string[]
): Promise<{ success: boolean; message: string; deleted: number }> => {
  const response = await axios.post(`${API_BASE_URL}/cleanup`, { keepIds });
  return response.data;
};

// ============ doc-operations API ============

const DOC_OPS_BASE_URL = config.docOpsApiUrl;

export type FindResult = {
  success: boolean;
  pattern: string;
  count: number;
  positions: Array<{ index: number; text: string; ref: string }>;
};

export const findText = async (
  docId: string,
  pattern: string
): Promise<FindResult> => {
  const response = await axios.post<FindResult>(`${DOC_OPS_BASE_URL}/find`, {
    docId,
    pattern,
  });
  return response.data;
};

export type ReplaceResult = {
  success: boolean;
  replaced?: number;
  message?: string;
};

export const replaceText = async (
  docId: string,
  targetText: string,
  replacement: string,
  replaceAll: boolean = false
): Promise<ReplaceResult> => {
  const response = await axios.post<ReplaceResult>(`${DOC_OPS_BASE_URL}/replace`, {
    docId,
    targetText,
    replacement,
    replaceAll,
  });
  return response.data;
};

export const getDocumentText = async (
  docId: string
): Promise<{ success: boolean; text: string }> => {
  const response = await axios.get(`${DOC_OPS_BASE_URL}/text/${docId}`);
  return response.data;
};

export const saveDocument = async (
  docId: string
): Promise<{ success: boolean; message: string }> => {
  const response = await axios.post(`${DOC_OPS_BASE_URL}/save/${docId}`);
  return response.data;
};
