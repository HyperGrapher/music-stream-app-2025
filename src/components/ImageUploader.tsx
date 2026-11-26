"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

interface ImageUploaderProps {
  purpose: "AVATAR" | "BANNER" | "ARTWORK";
  label: string;
  /** Called with the READY asset id (to be attached by saving the form) and a local preview URL. */
  onUploaded: (assetId: string, previewUrl: string) => void;
  className?: string;
}

/**
 * Direct browser -> R2 image upload (presigned PUT), then server-side processing into renditions
 * (`markArtworkUploadComplete`). The asset stays unattached until the surrounding form is saved.
 */
export function ImageUploader({ purpose, label, onUploaded, className }: ImageUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const getUrl = api.upload.getArtworkUploadUrl.useMutation();
  const complete = api.upload.markArtworkUploadComplete.useMutation();

  const upload = async (file: File) => {
    if (!TYPES.includes(file.type)) return toast.error("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return toast.error("The image is larger than 10 MB.");
    setBusy(true);
    try {
      const { uploadUrl, mediaAssetId } = await getUrl.mutateAsync({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        purpose,
      });
      const response = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!response.ok) throw new Error(`Upload failed (${response.status})`);
      await complete.mutateAsync({ mediaAssetId });
      onUploaded(mediaAssetId, URL.createObjectURL(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        aria-label={label}
        data-testid={`upload-${purpose.toLowerCase()}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
        <ImagePlus className="h-4 w-4" /> {busy ? "Uploading..." : label}
      </Button>
    </div>
  );
}
