"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { api } from "@/trpc/react";
import { CheckCircle2, Upload, X } from "lucide-react";

const MAX_ARTWORK_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_ARTWORK_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

interface ArtworkUploadProps {
  onArtworkUploaded: (mediaAssetId?: string) => void;
  existingArtworkAssetId?: string;
}

export function ArtworkUpload({
  onArtworkUploaded,
  existingArtworkAssetId,
}: ArtworkUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [artworkUploadId, setArtworkUploadId] = useState(
    existingArtworkAssetId,
  );
  const [uploadComplete, setUploadComplete] = useState(
    Boolean(existingArtworkAssetId),
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const getArtworkUrlMutation = api.upload.getArtworkUploadUrl.useMutation();
  const markCompleteMutation =
    api.upload.markArtworkUploadComplete.useMutation();
  const cancelUploadMutation = api.upload.cancelUpload.useMutation();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearLocalArtwork = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(undefined);
    setSelectedFile(null);
    setArtworkUploadId(undefined);
    setUploadComplete(false);
    setProgress(0);
    onArtworkUploaded(undefined);
  };

  const cancelArtwork = async () => {
    if (artworkUploadId) {
      await cancelUploadMutation.mutateAsync({
        mediaAssetId: artworkUploadId,
      });
    }

    clearLocalArtwork();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_ARTWORK_TYPES.includes(file.type)) {
      setError("Please select a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size === 0 || file.size > MAX_ARTWORK_FILE_SIZE) {
      setError("Artwork must be non-empty and no larger than 10 MB.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setError("");
  };

  const uploadArtwork = async () => {
    if (!selectedFile) return;

    let createdAssetId: string | undefined;

    try {
      setUploading(true);
      setProgress(0);
      setError("");

      const { uploadUrl, mediaAssetId } =
        await getArtworkUrlMutation.mutateAsync({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          fileSize: selectedFile.size,
        });
      createdAssetId = mediaAssetId;
      setArtworkUploadId(mediaAssetId);

      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () =>
          reject(new Error("Upload failed due to a network error"));
        xhr.ontimeout = () => reject(new Error("Artwork upload timed out"));
      });

      xhr.open("PUT", uploadUrl);
      xhr.timeout = 5 * 60 * 1000;
      xhr.setRequestHeader("Content-Type", selectedFile.type);
      xhr.send(selectedFile);
      await uploadPromise;

      await markCompleteMutation.mutateAsync({ mediaAssetId });
      setProgress(100);
      setUploadComplete(true);
      onArtworkUploaded(mediaAssetId);
    } catch (uploadError) {
      if (createdAssetId) {
        try {
          await cancelUploadMutation.mutateAsync({
            mediaAssetId: createdAssetId,
          });
        } catch (cleanupError) {
          console.error(
            "Failed to clean up artwork after upload error:",
            cleanupError,
          );
        }
      }

      setArtworkUploadId(undefined);
      setUploadComplete(false);
      setError(`Upload failed: ${(uploadError as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveArtwork = async () => {
    try {
      setError("");
      await cancelArtwork();
    } catch (removeError) {
      setError(`Failed to remove artwork: ${(removeError as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      <Label>Artwork</Label>

      {uploadComplete ? (
        <div className="bg-muted/50 relative w-full max-w-[200px] overflow-hidden rounded-md">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Artwork preview"
              className="aspect-square h-full w-full object-cover"
            />
          ) : (
            <div className="text-muted-foreground flex aspect-square items-center justify-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Artwork uploaded
            </div>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={handleRemoveArtwork}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            type="file"
            accept={ALLOWED_ARTWORK_TYPES.join(",")}
            onChange={handleFileChange}
            className="cursor-pointer"
            disabled={uploading}
          />

          {error && <p className="text-destructive text-sm">{error}</p>}

          {selectedFile && !uploading && (
            <div className="bg-muted/50 rounded-md p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearLocalArtwork}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-muted-foreground mb-2 text-xs">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
              <Button type="button" onClick={uploadArtwork} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Upload Artwork
              </Button>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <span className="text-xs">Uploading... {progress}%</span>
              <Progress value={progress} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
