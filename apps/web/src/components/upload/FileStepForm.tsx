"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useUploadStore } from "@/store/uploadStore";
import { api } from "@/trpc/react";
import { X, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import sanitize from 'sanitize-filename'


// Maximum file size in bytes (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Function to sanitize filenames - remove invalid chars and replace spaces with underscores
export const sanitizeFilename = (filename: string): string => {
    return sanitize(filename).replace(/\s+/g, '_');
};

// Allowed audio mime types
const ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/flac',
    'audio/aac',
    'audio/m4a',
];

interface FileStepFormProps {
    onFilesSelected: (files: File[]) => void;
}

export function FileStepForm({ onFilesSelected }: FileStepFormProps) {

    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [error, setError] = useState("");
    const { addFile, updateProgress, setCompleted, setError: setFileError, removeFile, updateFile } = useUploadStore();
    const uploadUrlMutation = api.upload.getUploadUrl.useMutation();
    const markCompleteMutation = api.upload.markUploadComplete.useMutation();
    const cancelUploadMutation = api.upload.cancelUpload.useMutation();

    // When files are selected, start uploading them immediately
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            try {
                const filesArray = Array.from(e.target.files);
                
                // Validate files
                const invalidFiles = filesArray.filter(file => !ALLOWED_AUDIO_TYPES.includes(file.type));
                if (invalidFiles.length > 0) {
                    setError("Some files have unsupported formats. Please upload MP3, WAV, OGG, FLAC, or AAC files.");
                    return;
                }
                
                // Validate file sizes
                const oversizedFiles = filesArray.filter(file => file.size > MAX_FILE_SIZE);
                if (oversizedFiles.length > 0) {
                    setError(`Some files exceed the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
                    return;
                }
                
                setSelectedFiles(prev => [...prev, ...filesArray]);
                setError("");
                
                // Begin uploading each file
                for (const file of filesArray) {
                    try {
                        await uploadFile(file);
                    } catch (err) {
                        console.error("Error uploading file:", err);
                        // Continue with other files even if one fails
                    }
                }
            } catch (err) {
                console.error("File selection error:", err);
                setError(`File selection error: ${(err as Error).message}`);
            }
        }
    };

    const uploadFile = async (file: File) => {
        try {
            // Sanitize filename - only do this once at the beginning
            const sanitizedFilename = sanitizeFilename(file.name);
            console.log(`Original filename: ${file.name}, Sanitized filename: ${sanitizedFilename}`);
            
            // Add the file to the upload store (with sanitized filename)
            const uploadingFile = addFile({
                ...file,
                name: sanitizedFilename // This will be used throughout the app
            });
            console.log(`Created uploadingFile:`, uploadingFile);

            // Update progress to show upload is starting
            updateProgress(uploadingFile.id, 0);
            
            console.log("Getting presigned URL for file:", sanitizedFilename);
            // Get a presigned URL for upload - use sanitized filename
            const { uploadUrl, fileKey, tempUploadId } = await uploadUrlMutation.mutateAsync({
                filename: sanitizedFilename,
                contentType: file.type,
                fileSize: file.size,
            });
            
            console.log("Got presigned URL:", { uploadUrl, fileKey, tempUploadId });
            
            // Update file with fileKey and tempUploadId using our new method
            updateFile(uploadingFile.id, { fileKey, tempUploadId });
            console.log(`Updated file with fileKey and tempUploadId:`, useUploadStore.getState().getFile(uploadingFile.id));
            
            // Upload the file directly to R2
            const xhr = new XMLHttpRequest();
            
            // Set up progress tracking
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded / event.total) * 100);
                    updateProgress(uploadingFile.id, progress);
                }
            };
            
            // Create a promise to handle the XHR completion
            const uploadPromise = new Promise<void>((resolve, reject) => {
                xhr.onload = async () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        console.log('uploadPromise xhr.onload onSuccess');
                        console.log("Upload successful, marking as complete");

                        try {
                            // Mark the upload as complete in the database
                            const result = await markCompleteMutation.mutateAsync({
                                tempUploadId,
                                fileKey,
                            });
                            console.log("Mark upload complete response:", result);
                            
                            // Update local state
                            setCompleted(uploadingFile.id, tempUploadId, fileKey);
                            console.log(`Upload completed for file:`, useUploadStore.getState().getFile(uploadingFile.id));
                            toast.success(`${sanitizedFilename} uploaded successfully`);
                            resolve();
                        } catch (err) {
                            console.error("Error marking upload as complete:", err);
                            const error = `Failed to mark upload as complete: ${(err as Error).message}`;
                            setFileError(uploadingFile.id, error);
                            reject(new Error(error));
                        }
                    } else {
                        console.error("Upload failed with status:", xhr.status);
                        const error = `Upload failed with status ${xhr.status}: ${xhr.responseText || 'Unknown error'}`;
                        setFileError(uploadingFile.id, error);
                        reject(new Error(error));
                    }
                };
                
                xhr.onerror = () => {
                    console.error("Network error during upload");
                    const error = "Upload failed due to network error";
                    setFileError(uploadingFile.id, error);
                    reject(new Error(error));
                };
                
                xhr.ontimeout = () => {
                    console.error("Upload timed out");
                    const error = "Upload timed out";
                    setFileError(uploadingFile.id, error);
                    reject(new Error(error));
                };
            });
            
            // Start the upload
            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", file.type);
            
            console.log("Starting file upload to R2");
            xhr.send(file);
            
            // Wait for upload to complete
            await uploadPromise;
            
            // Log final state of all uploads
            console.log("All uploads state after completion:", useUploadStore.getState().uploadingFiles);
            
        } catch (err) {
            console.error("Upload file error:", err);
            const errorMessage = `Upload failed: ${(err as Error).message}`;
            setError(errorMessage);
            throw err; // Re-throw to handle in the caller
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (selectedFiles.length === 0) {
            setError("Please select at least one file.");
            return;
        }
        
        onFilesSelected(selectedFiles);
    };

    const handleRemoveFile = async (index: number, fileUploadId?: string, fileKey?: string) => {
        // If file was uploaded to R2, try to delete it
        if (fileUploadId && fileKey) {
            try {
                // Get the uploadingFile from store
                const uploadingFile = useUploadStore.getState().uploadingFiles.find(f => f.id === fileUploadId);
                
                if (uploadingFile) {
                    // If file was uploaded to R2, delete it
                    if (uploadingFile.fileKey && uploadingFile.tempUploadId) {
                        await cancelUploadMutation.mutateAsync({
                            fileKey: uploadingFile.fileKey,
                            tempUploadId: uploadingFile.tempUploadId,
                        });
                    }
                    
                    // Remove from store
                    removeFile(fileUploadId);
                    toast.success("File removed and upload canceled");
                }
            } catch (err) {
                console.error("Error removing file:", err);
                toast.error(`Error removing file: ${(err as Error).message}`);
            }
        }
        
        // Remove from local state
        const newFiles = [...selectedFiles];
        newFiles.splice(index, 1);
        setSelectedFiles(newFiles);
    };

    // Check if all uploads are completed
    const allUploadsCompleted = useUploadStore(state => 
        state.uploadingFiles.length > 0 && 
        state.uploadingFiles.every(file => file.status === "completed")
    );

    // Get the files from the store
    const uploadingFiles = useUploadStore(state => state.uploadingFiles);

    // Check if any files are in an error state
    const hasErrors = uploadingFiles.some(file => file.status === "error");

    return (
        <Card className="p-6">
            <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-4">Upload your tracks</h2>
                        <p className="text-muted-foreground mb-6">
                            Select audio files to upload. You can upload a single track or multiple files to create an album.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="files">Select audio files</Label>
                        <Input
                            id="files"
                            type="file"
                            accept="audio/*"
                            multiple
                            onChange={handleFileChange}
                            className="cursor-pointer"
                        />
                        {error && <p className="text-destructive text-sm mt-2">{error}</p>}
                        {hasErrors && (
                            <p className="text-destructive text-sm mt-2">
                                Some files failed to upload. Please remove them and try again.
                            </p>
                        )}
                        
                        {selectedFiles.length > 0 && (
                            <div className="mt-4 space-y-4">
                                <p className="text-sm font-medium mb-2">Selected files:</p>
                                <ul className="space-y-3">
                                    {selectedFiles.map((file, index) => {
                                        // Find the upload progress for this file
                                        // Look by both original name and sanitized name
                                        const fileUpload = uploadingFiles.find(u => 
                                            u.file.name === file.name || 
                                            u.originalName === file.name ||
                                            u.file.name === sanitizeFilename(file.name)
                                        );
                                        
                                        return (
                                            <li key={index} className="bg-muted/50 rounded-md p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium">
                                                        {file.name}
                                                    </span>
                                                    <div className="flex space-x-1">
                                                        {fileUpload?.status === "error" && (
                                                            <Button
                                                                type="button"
                                                                variant="destructive"
                                                                size="sm"
                                                                onClick={() => handleRemoveFile(index, fileUpload.id, fileUpload.fileKey)}
                                                                title="Remove file"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemoveFile(index, fileUpload?.id, fileUpload?.fileKey)}
                                                            disabled={fileUpload?.status === "uploading"}
                                                            title="Remove file"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                                                </div>
                                                
                                                {fileUpload && (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <div className="flex items-center">
                                                                {fileUpload.status === "uploading" && (
                                                                    <span>Uploading... {fileUpload.progress}%</span>
                                                                )}
                                                                {fileUpload.status === "completed" && (
                                                                    <span className="flex items-center text-green-600">
                                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                        Upload complete
                                                                    </span>
                                                                )}
                                                                {fileUpload.status === "error" && (
                                                                    <span className="flex items-center text-destructive">
                                                                        <AlertCircle className="h-3 w-3 mr-1" />
                                                                        {fileUpload.error || "Upload failed"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        <Progress 
                                                            value={fileUpload.progress} 
                                                            className={fileUpload.status === "error" ? "bg-destructive" : ""} 
                                                        />
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>

                    <Button 
                        type="submit" 
                        disabled={selectedFiles.length === 0 || !allUploadsCompleted || hasErrors}
                        className="w-full mt-4"
                    >
                        {!allUploadsCompleted && selectedFiles.length > 0
                            ? "Waiting for uploads to complete..."
                            : "Continue to Details"
                        }
                    </Button>
                </div>
            </form>
        </Card>
    );
}