import { uploadDocuments, deleteDocument } from "@/api/docApi";
import type { DocumentInfo } from "@/api/docApi";

type FileChangeCallback = (files: Map<string, Blob>, currentFileName: string | null) => void;

class FileStore {
  private files: Map<string, Blob> = new Map();
  private uploadedFiles: Map<string, string> = new Map();
  private listeners: Set<FileChangeCallback> = new Set();

  getFiles(): Map<string, Blob> {
    return this.files;
  }

  getFileList(): DocumentInfo[] {
    return Array.from(this.files.entries()).map(([name, blob], index) => ({
      id: `local-${index}`,
      originalName: name,
      storedName: name,
      size: blob.size,
      mimeType: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploadedAt: new Date().toISOString(),
      filePath: "",
    }));
  }

  getUploadedFileIds(): string[] {
    return Array.from(this.uploadedFiles.values());
  }

  hasFile(fileName: string): boolean {
    return this.files.has(fileName);
  }

  addFile(fileName: string, blob: Blob): void {
    this.files.set(fileName, blob);
    this.notify();
  }

  removeFile(fileName: string): void {
    this.files.delete(fileName);
    this.uploadedFiles.delete(fileName);
    this.notify();
  }

  getFile(fileName: string): Blob | undefined {
    return this.files.get(fileName);
  }

  setUploadedId(fileName: string, id: string): void {
    this.uploadedFiles.set(fileName, id);
  }

  subscribe(callback: FileChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb(this.files, null));
  }

  async uploadFile(file: File): Promise<{ success: boolean; fileId?: string }> {
    try {
      const response = await uploadDocuments([file]);
      if (response.success && response.files.length > 0) {
        return { success: true, fileId: response.files[0].id };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }

  async deleteFile(id: string, fileName: string): Promise<boolean> {
    if (id.startsWith("local-")) {
      this.removeFile(fileName);
      return true;
    }
    try {
      await deleteDocument(id);
      this.removeFile(fileName);
      return true;
    } catch {
      return false;
    }
  }

  updateFileFromServer(fileName: string, blob: Blob): void {
    this.files.set(fileName, blob);
    this.notify();
  }

  cleanupUploadedFiles(): void {
    this.files.clear();
    this.uploadedFiles.clear();
    this.notify();
  }
}

export const fileStore = new FileStore();
