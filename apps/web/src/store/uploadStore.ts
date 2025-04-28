import { create } from "zustand";

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "completed" | "error";
  tempUploadId?: string;
  fileKey?: string;
  error?: string;
  originalName?: string;
}

interface UploadStore {
  // Files being uploaded
  uploadingFiles: UploadingFile[];
  
  // Add a file to the upload queue
  addFile: (file: File) => UploadingFile;
  
  // Update file upload progress
  updateProgress: (id: string, progress: number) => void;
  
  // Set upload completed
  setCompleted: (id: string, tempUploadId: string, fileKey: string) => void;
  
  // Set upload error
  setError: (id: string, error: string) => void;
  
  // Get file by id
  getFile: (id: string) => UploadingFile | undefined;
  
  // Get file by filename
  getFileByName: (filename: string) => UploadingFile | undefined;
  
  // Remove a file from the upload queue
  removeFile: (id: string) => void;
  
  // Clear all files
  clearFiles: () => void;
  
  // Update file properties
  updateFile: (id: string, props: Partial<UploadingFile>) => void;
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploadingFiles: [],
  
  addFile: (file: File) => {
    const id = crypto.randomUUID();
    const newFile: UploadingFile = {
      id,
      file,
      progress: 0,
      status: "uploading",
      originalName: file.name,
    };
    
    set((state) => ({
      uploadingFiles: [...state.uploadingFiles, newFile],
    }));
    
    return newFile;
  },
  
  updateProgress: (id: string, progress: number) => {
    set((state) => ({
      uploadingFiles: state.uploadingFiles.map((file) =>
        file.id === id ? { ...file, progress } : file
      ),
    }));
  },
  
  setCompleted: (id: string, tempUploadId: string, fileKey: string) => {
    set((state) => ({
      uploadingFiles: state.uploadingFiles.map((file) =>
        file.id === id ? { ...file, status: "completed", tempUploadId, fileKey } : file
      ),
    }));
  },
  
  setError: (id: string, error: string) => {
    set((state) => ({
      uploadingFiles: state.uploadingFiles.map((file) =>
        file.id === id ? { ...file, status: "error", error } : file
      ),
    }));
  },
  
  getFile: (id: string) => {
    return get().uploadingFiles.find(file => file.id === id);
  },
  
  getFileByName: (filename: string) => {
    return get().uploadingFiles.find(file => 
      file.file.name === filename || file.originalName === filename
    );
  },
  
  removeFile: (id: string) => {
    set((state) => ({
      uploadingFiles: state.uploadingFiles.filter((file) => file.id !== id),
    }));
  },
  
  clearFiles: () => {
    set({ uploadingFiles: [] });
  },
  
  // New method to update file properties
  updateFile: (id: string, props: Partial<UploadingFile>) => {
    set((state) => ({
      uploadingFiles: state.uploadingFiles.map((file) =>
        file.id === id ? { ...file, ...props } : file
      ),
    }));
  },
})); 