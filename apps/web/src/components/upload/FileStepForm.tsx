"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useUploadStore } from "@/store/uploadStore";
import { api } from "@/trpc/react";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";

interface FileStepFormProps {
    onFilesSelected: (files: File[]) => void;
}

export function FileStepForm({ onFilesSelected }: FileStepFormProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [error, setError] = useState("");
    const { addFile, updateProgress, setCompleted, setError: setFileError } = useUploadStore();
    const uploadUrlMutation = api.upload.getUploadUrl.useMutation();
    const markCompleteMutation = api.upload.markUploadComplete.useMutation();

    // When files are selected, start uploading them immediately
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            
            // Validate files (you can add more validation later)
            const audioFiles = filesArray.filter(file => file.type.startsWith('audio/'));
            if (audioFiles.length !== filesArray.length) {
                setError("Please upload audio files only.");
                return;
            }
            
            setSelectedFiles(audioFiles);
            setError("");
            
            // Begin uploading each file
            for (const file of audioFiles) {
                await uploadFile(file);
            }
        }
    };

    const uploadFile = async (file: File) => {
        try {
            // Add the file to the upload store
            const uploadingFile = addFile(file);
            
            // Get a presigned URL for upload
            const { uploadUrl, fileKey, tempUploadId } = await uploadUrlMutation.mutateAsync({
                filename: file.name,
                contentType: file.type,
            });
            
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
                        // Mark the upload as complete in the database
                        await markCompleteMutation.mutateAsync({
                            tempUploadId,
                            fileKey,
                        });
                        
                        // Update local state
                        setCompleted(uploadingFile.id, tempUploadId, fileKey);
                        resolve();
                    } else {
                        const error = `Upload failed with status ${xhr.status}`;
                        setFileError(uploadingFile.id, error);
                        reject(new Error(error));
                    }
                };
                
                xhr.onerror = () => {
                    const error = "Upload failed due to network error";
                    setFileError(uploadingFile.id, error);
                    reject(new Error(error));
                };
            });
            
            // Start the upload
            xhr.open("PUT", uploadUrl);
            xhr.setRequestHeader("Content-Type", file.type);
            xhr.send(file);
            
            // Wait for upload to complete
            await uploadPromise;
            
        } catch (err) {
            setError(`Upload failed: ${(err as Error).message}`);
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

    const handleRemoveFile = (index: number) => {
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
                        {error && <p className="text-destructive text-sm">{error}</p>}
                        
                        {selectedFiles.length > 0 && (
                            <div className="mt-4 space-y-4">
                                <p className="text-sm font-medium mb-2">Selected files:</p>
                                <ul className="space-y-3">
                                    {selectedFiles.map((file, index) => {
                                        // Find the upload progress for this file
                                        const fileUpload = uploadingFiles.find(u => u.file.name === file.name);
                                        
                                        return (
                                            <li key={index} className="bg-muted/50 rounded-md p-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium">
                                                        {file.name}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRemoveFile(index)}
                                                        disabled={fileUpload?.status === "uploading"}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
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
                        disabled={selectedFiles.length === 0 || !allUploadsCompleted}
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