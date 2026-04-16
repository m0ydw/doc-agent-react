import axios from "axios";

const API_BASE_URL = "http://localhost:3000/api/docs";

export type DocumentInfo = {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  filePath: string;
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

export const getDocumentInfo = async (
  id: string
): Promise<{ success: boolean; document: DocumentInfo }> => {
  const response = await axios.get(`${API_BASE_URL}/${id}/info`);
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
