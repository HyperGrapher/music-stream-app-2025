import { create } from "zustand";

import { analyzeAudioFile } from "@/lib/analyze-audio";
import { MAX_UPLOAD_BATCH } from "@/lib/collection-fields";
import { friendlyError } from "@/lib/error-messages";
import { titleFromFilename, type TrackFields } from "@/lib/track-fields";
import { vanillaApi } from "@/trpc/vanilla";

/**
 * The upload batch and its per-file pipeline (PRD 7.2):
 * Queued -> Uploading (bytes %) -> Analysing (decode in the browser) -> Verifying (server) -> Ready | Failed.
 * Three uploads run at once, at most two decodes (memory). A failed file never blocks the others.
 */
export type ItemState = "queued" | "uploading" | "analysing" | "verifying" | "ready" | "failed";

export interface BatchItem {
  id: string;
  file: File;
  state: ItemState;
  progress: number;
  mediaAssetId?: string;
  durationMs?: number;
  error?: string;
  /** Editable details of this track (title always set; the rest optional). */
  fields: TrackFields;
  selected: boolean;
}

const MAX_UPLOADS = 3;
const MAX_DECODES = 2;
const AUDIO_TYPES: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/m4a" };
export const ACCEPTED_EXTENSIONS = Object.keys(AUDIO_TYPES);
/** Largest file any plan accepts; the account's own limit comes from `upload.quota` (the server decides). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** UP-2: validates a file before anything is uploaded; returns the reason it is refused, or null. */
export function fileProblem(file: File, maxBytes = MAX_FILE_BYTES): string | null {
  if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) return "Unsupported format. Use MP3, WAV, OGG, FLAC, AAC or M4A.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxBytes) return `Larger than ${formatMb(maxBytes)}.`;
  return null;
}
const contentTypeOf = (file: File) => AUDIO_TYPES[extensionOf(file.name)] ?? file.type;

interface BatchState {
  items: BatchItem[];
  /** Files that were refused up front, with the reason (UP-2). */
  rejected: { name: string; reason: string }[];
  /** The account's per-file limit (Free 10 MB, Pro 100 MB). */
  maxFileBytes: number;
  setMaxFileBytes: (bytes: number) => void;
  addFiles: (files: File[]) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  updateFields: (id: string, fields: Partial<TrackFields>) => void;
  setSelected: (id: string, selected: boolean) => void;
  move: (from: number, to: number) => void;
  /** Cancels what is not published yet (UP-7) and empties the batch. */
  reset: () => void;
  /** Called after publishing: forgets the items without cancelling their (now attached) assets. */
  clearPublished: () => void;
}

const xhrs = new Map<string, XMLHttpRequest>();
let activeUploads = 0;
let activeDecodes = 0;
const decodeWaiters: (() => void)[] = [];

async function withDecodeSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDecodes >= MAX_DECODES) await new Promise<void>((resolve) => decodeWaiters.push(resolve));
  activeDecodes++;
  try {
    return await task();
  } finally {
    activeDecodes--;
    decodeWaiters.shift()?.();
  }
}

export const useUploadBatch = create<BatchState>((set, get) => {
  const patch = (id: string, change: Partial<BatchItem>) =>
    set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, ...change } : item)) }));

  /** Starts queued items while upload slots are free. */
  const pump = () => {
    for (const item of get().items) {
      if (activeUploads >= MAX_UPLOADS) return;
      if (item.state === "queued") void run(item.id);
    }
  };

  const run = async (id: string) => {
    const item = get().items.find((i) => i.id === id);
    if (item?.state !== "queued") return;
    activeUploads++;
    let held = true; // whether this run still occupies an upload slot
    patch(id, { state: "uploading", progress: 0, error: undefined });
    try {
      const { uploadUrl, mediaAssetId } = await vanillaApi.upload.getUploadUrl.mutate({
        filename: item.file.name,
        contentType: contentTypeOf(item.file),
        fileSize: item.file.size,
      });
      patch(id, { mediaAssetId });

      // Decode while the bytes upload (UP-4): at most two decodes at a time.
      const analysis = withDecodeSlot(() => analyzeAudioFile(item.file)).catch(() => undefined);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrs.set(id, xhr);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) patch(id, { progress: Math.round((event.loaded / event.total) * 100) });
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Canceled"));
        xhr.ontimeout = () => reject(new Error("The upload timed out"));
        xhr.timeout = 10 * 60_000;
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentTypeOf(item.file));
        xhr.send(item.file);
      });
      xhrs.delete(id);
      // Slot freed as soon as the bytes are up; the rest is light work.
      held = false;
      activeUploads--;
      pump();

      patch(id, { state: "analysing", progress: 100 });
      const result = await analysis;
      if (!result) {
        void vanillaApi.upload.cancelUpload.mutate({ mediaAssetId }).catch(() => undefined);
        throw new Error("Your browser can't read this file. Try MP3, WAV or FLAC.");
      }
      patch(id, { state: "verifying" });
      const verified = await vanillaApi.upload.markUploadComplete.mutate({ mediaAssetId, analysis: result });
      patch(id, { state: "ready", durationMs: verified.durationMs });
    } catch (error) {
      xhrs.delete(id);
      if (held) activeUploads--;
      const message = error instanceof Error && !("data" in error) ? error.message : friendlyError(error as never, "Upload failed");
      // A removed item is gone from the list; patching it is a no-op.
      patch(id, { state: "failed", error: message });
      pump();
    }
  };

  return {
    items: [],
    rejected: [],
    maxFileBytes: MAX_FILE_BYTES,
    setMaxFileBytes: (bytes) => set({ maxFileBytes: bytes }),
    addFiles: (files) => {
      const rejected: { name: string; reason: string }[] = [];
      const accepted: BatchItem[] = [];
      const room = MAX_UPLOAD_BATCH - get().items.length;
      for (const file of files) {
        const problem = fileProblem(file, get().maxFileBytes) ?? (accepted.length >= room ? `A batch holds at most ${MAX_UPLOAD_BATCH} files.` : null);
        if (problem) rejected.push({ name: file.name, reason: problem });
        else accepted.push({ id: crypto.randomUUID(), file, state: "queued", progress: 0, fields: { title: titleFromFilename(file.name) }, selected: false });
      }
      set((state) => ({ items: [...state.items, ...accepted], rejected }));
      pump();
    },
    retry: (id) => {
      const item = get().items.find((i) => i.id === id);
      if (item?.state !== "failed") return;
      // The failed attempt's asset (if any) is released; a fresh one is created.
      if (item.mediaAssetId) void vanillaApi.upload.cancelUpload.mutate({ mediaAssetId: item.mediaAssetId }).catch(() => undefined);
      patch(id, { state: "queued", progress: 0, error: undefined, mediaAssetId: undefined });
      pump();
    },
    remove: (id) => {
      const item = get().items.find((i) => i.id === id);
      xhrs.get(id)?.abort();
      if (item?.mediaAssetId) void vanillaApi.upload.cancelUpload.mutate({ mediaAssetId: item.mediaAssetId }).catch(() => undefined);
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    },
    updateFields: (id, fields) =>
      set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, fields: { ...item.fields, ...fields } } : item)) })),
    setSelected: (id, selected) => patch(id, { selected }),
    move: (from, to) =>
      set((state) => {
        const items = [...state.items];
        const [moved] = items.splice(from, 1);
        if (moved) items.splice(to, 0, moved);
        return { items };
      }),
    reset: () => {
      for (const item of get().items) {
        xhrs.get(item.id)?.abort();
        if (item.mediaAssetId) void vanillaApi.upload.cancelUpload.mutate({ mediaAssetId: item.mediaAssetId }).catch(() => undefined);
      }
      set({ items: [], rejected: [] });
    },
    clearPublished: () => set({ items: [], rejected: [] }),
  };
});

export const isBusy = (items: BatchItem[]) => items.some((i) => ["queued", "uploading", "analysing", "verifying"].includes(i.state));
