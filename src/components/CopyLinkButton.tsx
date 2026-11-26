"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copies an absolute URL for a path (the full share dialog arrives with M3). */
export function CopyLinkButton({ path, label = "Share" }: { path: string; label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
      onClick={() => {
        void navigator.clipboard
          .writeText(new URL(path, window.location.origin).toString())
          .then(() => toast.success("Link copied"))
          .catch(() => toast.error("Could not copy the link"));
      }}
    >
      <Share2 className="h-4 w-4" /> {label}
    </Button>
  );
}
