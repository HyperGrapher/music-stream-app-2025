"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useUploadStore } from "@/store/uploadStore";
import { api } from "@/trpc/react";
import { analyzeAudioFile } from "@/lib/analyze-audio";
import { X, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Maximum file size in bytes; mirrors `maxFileBytes` in server/modules/plans/entitlements.ts (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Allowed audio mime types
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/m4a",
];

interface FileStepFormProps {
  onFilesSelected: (files: File[]) => void;
}

export function FileStepForm({ onFilesSelected }: FileStepFormProps) {
  const [error, setError] = useState("");
  const {
    addFile,
    updateProgress,
    setCompleted,
    setError: setFileError,
    removeFile,
    updateFile,
  } = useUploadStore();
  const uploadUrlMutation = api.upload.getUploadUrl.useMutation();
  const markCompleteMutation = api.upload.markUploadComplete.useMutation();
  const cancelUploadMutation = api.upload.cancelUpload.useMutation();

  // When files are selected, start uploading them immediately
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const filesArray = Array.from(e.target.files);

        // Validate files
        const invalidFiles = filesArray.filter(
          (file) => !ALLOWED_AUDIO_TYPES.includes(file.type),
        );
        if (invalidFiles.length > 0) {
          setError(
            "Some files have unsupported formats. Please upload MP3, WAV, OGG, FLAC, or AAC files.",
          );
          return;
        }

        // Validate file sizes
        const oversizedFiles = filesArray.filter(
          (file) => file.size > MAX_FILE_SIZE,
        );
        if (oversizedFiles.length > 0) {
          setError(
            `Some files exceed the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
          );
          return;
        }

        const emptyFiles = filesArray.filter((file) => file.size === 0);
        if (emptyFiles.length > 0) {
          setError("Empty audio files cannot be uploaded.");
          return;
        }

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
    const uploadingFile = addFile(file);

    // Decode in the browser while the upload runs. A file the browser cannot decode is rejected
    // (PRD UP-F2): there is no "no waveform" state for new uploads.
    const analysisPromise = analyzeAudioFile(file).catch((analysisError) => {
      console.warn("Could not analyze audio in the browser:", analysisError);
      return undefined;
    });

    try {
      console.log(`Created uploadingFile:`, uploadingFile);

      // Update progress to show upload is starting
      updateProgress(uploadingFile.id, 0);

      console.log("Getting presigned URL for file:", file.name);
      const { uploadUrl, mediaAssetId } = await uploadUrlMutation.mutateAsync({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
      });

      console.log("Got presigned URL for upload", { mediaAssetId });

      updateFile(uploadingFile.id, { mediaAssetId });

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
            console.log("uploadPromise xhr.onload onSuccess");
            console.log("Upload successful, marking as complete");

            try {
              const analysis = await analysisPromise;
              if (!analysis) {
                // Free the uploaded object right away; the daily cron would do it eventually.
                cancelUploadMutation.mutate({ mediaAssetId });
                throw new Error("Your browser can't read this file. Try MP3, WAV or FLAC.");
              }
              // Mark the upload as complete in the database
              const result = await markCompleteMutation.mutateAsync({
                mediaAssetId,
                analysis,
              });
              console.log("Mark upload complete response:", result);

              // Update local state
              setCompleted(uploadingFile.id, mediaAssetId);
              console.log(
                `Upload completed for file:`,
                useUploadStore.getState().getFile(uploadingFile.id),
              );
              toast.success(`${file.name} uploaded successfully`);
              resolve();
            } catch (err) {
              console.error("Error marking upload as complete:", err);
              const error = `Failed to mark upload as complete: ${(err as Error).message}`;
              setFileError(uploadingFile.id, error);
              reject(new Error(error));
            }
          } else {
            console.error("Upload failed with status:", xhr.status);
            const error = `Upload failed with status ${xhr.status}: ${xhr.responseText || "Unknown error"}`;
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
      xhr.timeout = 5 * 60 * 1000;
      xhr.setRequestHeader("Content-Type", file.type);

      console.log("Starting file upload to R2");
      xhr.send(file);

      // Wait for upload to complete
      await uploadPromise;

      // Log final state of all uploads
      console.log(
        "All uploads state after completion:",
        useUploadStore.getState().uploadingFiles,
      );
    } catch (err) {
      console.error("Upload file error:", err);
      const errorMessage = `Upload failed: ${(err as Error).message}`;
      setFileError(uploadingFile.id, errorMessage);
      setError(errorMessage);
      throw err; // Re-throw to handle in the caller
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const completedFiles = uploadingFiles.map((upload) => upload.file);
    if (completedFiles.length === 0) {
      setError("Please select at least one file.");
      return;
    }

    onFilesSelected(completedFiles);
  };

  const handleRemoveFile = async (fileUploadId?: string) => {
    // If file was uploaded to R2, try to delete it
    if (fileUploadId) {
      try {
        // Get the uploadingFile from store
        const uploadingFile = useUploadStore
          .getState()
          .uploadingFiles.find((f) => f.id === fileUploadId);

        if (uploadingFile) {
          // If file was uploaded to R2, delete it
          if (uploadingFile.mediaAssetId) {
            await cancelUploadMutation.mutateAsync({
              mediaAssetId: uploadingFile.mediaAssetId,
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
  };

  // Check if all uploads are completed
  const allUploadsCompleted = useUploadStore(
    (state) =>
      state.uploadingFiles.length > 0 &&
      state.uploadingFiles.every((file) => file.status === "completed"),
  );

  // Get the files from the store
  const uploadingFiles = useUploadStore((state) => state.uploadingFiles);

  // Check if any files are in an error state
  const hasErrors = uploadingFiles.some((file) => file.status === "error");

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div>
            <h2 className="mb-4 text-2xl font-bold">Upload your tracks</h2>
            <p className="text-muted-foreground mb-6">
              Select audio files to upload. You can upload a single track or
              multiple files to create an album.
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
            {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
            {hasErrors && (
              <p className="text-destructive mt-2 text-sm">
                Some files failed to upload. Please remove them and try again.
              </p>
            )}

            {uploadingFiles.length > 0 && (
              <div className="mt-4 space-y-4">
                <p className="mb-2 text-sm font-medium">Selected files:</p>
                <ul className="space-y-3">
                  {uploadingFiles.map((fileUpload) => {
                    const file = fileUpload.file;

                    return (
                      <li
                        key={fileUpload.id}
                        className="bg-muted/50 rounded-md p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {file.name}
                          </span>
                          <div className="flex space-x-1">
                            {fileUpload?.status === "error" && (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveFile(fileUpload.id)}
                                title="Remove file"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFile(fileUpload.id)}
                              disabled={fileUpload.status === "uploading"}
                              title="Remove file"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="text-muted-foreground mb-2 text-xs">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center">
                              {fileUpload.status === "uploading" && (
                                <span>Uploading... {fileUpload.progress}%</span>
                              )}
                              {fileUpload.status === "completed" && (
                                <span className="flex items-center text-green-600">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Upload complete
                                </span>
                              )}
                              {fileUpload.status === "error" && (
                                <span className="text-destructive flex items-center">
                                  <AlertCircle className="mr-1 h-3 w-3" />
                                  {fileUpload.error || "Upload failed"}
                                </span>
                              )}
                            </div>
                          </div>

                          <Progress
                            value={fileUpload.progress}
                            className={
                              fileUpload.status === "error"
                                ? "bg-destructive"
                                : ""
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <Button
            type="submit"
            disabled={
              uploadingFiles.length === 0 || !allUploadsCompleted || hasErrors
            }
            className="mt-4 w-full"
          >
            {!allUploadsCompleted && uploadingFiles.length > 0
              ? "Waiting for uploads to complete..."
              : "Continue to Details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
