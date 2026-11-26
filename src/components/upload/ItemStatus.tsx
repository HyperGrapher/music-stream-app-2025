"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BatchItem } from "@/store/uploadBatch";
import { useUploadBatch } from "@/store/uploadBatch";

const LABEL: Record<BatchItem["state"], string> = {
  queued: "Queued",
  uploading: "Uploading",
  analysing: "Analysing audio",
  verifying: "Verifying",
  ready: "Ready",
  failed: "Failed",
};

/** One file's pipeline state with progress, and Retry / Remove on failure (PRD UP-5). */
export function ItemStatus({ item, compact = false }: { item: BatchItem; compact?: boolean }) {
  const { retry, remove } = useUploadBatch();
  const busy = item.state === "uploading" || item.state === "analysing" || item.state === "verifying";
  return (
    <div className="min-w-0 text-xs" data-testid="item-status" data-state={item.state}>
      <div className="flex items-center gap-2">
        {item.state === "ready" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : item.state === "failed" ? <AlertTriangle className="h-4 w-4 text-red-400" /> : busy ? <Loader2 className="h-4 w-4 animate-spin text-orange-400" /> : null}
        <span className={item.state === "failed" ? "text-red-400" : item.state === "ready" ? "text-green-400" : "text-zinc-300"}>
          {LABEL[item.state]}
          {item.state === "uploading" ? ` ${item.progress}%` : ""}
        </span>
        {!compact && <span className="truncate text-zinc-500">{item.file.name}</span>}
        {item.state === "failed" && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => retry(item.id)} className="h-6 border-zinc-700 bg-transparent px-2 text-xs text-white hover:bg-zinc-800">
              <RotateCcw className="h-3 w-3" /> Retry
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => remove(item.id)} className="h-6 px-2 text-xs text-zinc-400 hover:bg-zinc-800">
              <X className="h-3 w-3" /> Remove
            </Button>
          </>
        )}
      </div>
      {item.state === "uploading" && <Progress value={item.progress} className="mt-1.5 h-1" />}
      {item.state === "failed" && item.error && <p role="alert" className="mt-1 text-red-400">{item.error}</p>}
    </div>
  );
}
