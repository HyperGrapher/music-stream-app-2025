"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { api } from "@/trpc/react";
import { X, AlertCircle, CheckCircle2, Upload } from "lucide-react";

interface ArtworkUploadProps {
  onArtworkUploaded: (artworkUrl: string) => void;
  existingArtworkUrl?: string;
}

export function ArtworkUpload({ onArtworkUploaded, existingArtworkUrl }: ArtworkUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | undefined>(existingArtworkUrl);

  const getArtworkUrlMutation = api.upload.getArtworkUploadUrl.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validate file type (only images)
      if (!file.type.startsWith('image/')) {
        setError("Please select an image file");
        return;
      }

      setSelectedFile(file);
      setError("");
    }
  };

  const uploadArtwork = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setProgress(0);

      // Get a presigned URL for uploading
      const { uploadUrl, fileUrl } = await getArtworkUrlMutation.mutateAsync({
        filename: selectedFile.name,
        contentType: selectedFile.type,
        fileSize: selectedFile.size,
      });

      // Upload directly to R2 using the presigned URL
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progressValue = Math.round((event.loaded / event.total) * 100);
          setProgress(progressValue);
        }
      };

      // Create a promise to handle the XHR completion
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setArtworkUrl(fileUrl);
            onArtworkUploaded(fileUrl);
            resolve();
          } else {
            const errorMsg = `Upload failed with status ${xhr.status}`;
            setError(errorMsg);
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          const errorMsg = "Upload failed due to network error";
          setError(errorMsg);
          reject(new Error(errorMsg));
        };
      });

      // Start the upload
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", selectedFile.type);
      xhr.send(selectedFile);

      // Wait for upload to complete
      await uploadPromise;

    } catch (err: unknown) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setProgress(0);
  };

  const handleRemoveArtwork = () => {
    setArtworkUrl(undefined);
    onArtworkUploaded(''); // Clear the artwork URL
  };

  return (
    <div className="space-y-4">
      <Label>Artwork</Label>

      {artworkUrl ? (
        <div className="relative w-full max-w-[200px]">
          <img 
            src={artworkUrl} 
            alt="Artwork" 
            className="w-full h-full object-cover rounded-md"
          />
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
            accept="image/*"
            onChange={handleFileChange}
            className="cursor-pointer"
            disabled={uploading}
          />

          {error && <p className="text-destructive text-sm">{error}</p>}

          {selectedFile && !uploading && (
            <div className="bg-muted/50 rounded-md p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
              <Button 
                type="button" 
                onClick={uploadArtwork} 
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Artwork
              </Button>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span>Uploading... {progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
