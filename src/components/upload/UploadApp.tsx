"use client";

import { UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MAX_UPLOAD_BATCH } from "@/lib/collection-fields";
import { formatDuration } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS, isBusy, useUploadBatch } from "@/store/uploadBatch";
import { api } from "@/trpc/react";

import { ReleaseStage } from "./ReleaseStage";
import { SingleTrackStage } from "./SingleTrackStage";

const minutes = (ms: number) => Math.round(ms / 60_000);

/** Stage A + B of the upload page (PRD 7.1): choose files, then edit while they upload in the background. */
export function UploadApp({ username }: { username: string }) {
  const router = useRouter();
  const { items, rejected, addFiles, reset } = useUploadBatch();
  const { data: quota } = api.upload.quota.useQuery();
  const [asPlaylist, setAsPlaylist] = useState(true);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const create = api.upload.createTrack.useMutation();
  const plan = quota?.plan ?? "FREE";
  const busy = isBusy(items);

  // UP-7: leaving while something uploads or is unsaved warns, and cancels what was not published.
  useEffect(() => {
    if (items.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items.length]);
  useEffect(() => () => useUploadBatch.getState().reset(), []);

  const readyMs = items.reduce((sum, i) => sum + (i.durationMs ?? 0), 0);
  const overQuota = quota?.remainingMs != null && readyMs > quota.remainingMs;
  const readyCount = items.filter((i) => i.state === "ready").length;

  const choose = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length > 0) addFiles(list);
  };

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-white">
        <h1 className="mb-6 text-2xl font-bold">Upload</h1>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}
          className={`rounded-xl border-2 border-dashed p-12 text-center transition ${dragging ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 bg-zinc-950"}`}
        >
          <UploadCloud className="mx-auto h-10 w-10 text-zinc-500" />
          <p className="mt-4 text-lg font-semibold">Drag and drop your tracks &amp; albums here</p>
          <p className="mt-1 text-xs text-zinc-500">MP3, WAV, OGG, FLAC, AAC or M4A, up to 100 MB each, up to {MAX_UPLOAD_BATCH} files.</p>
          <input ref={input} id="files" type="file" multiple accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",")} className="sr-only" aria-label="Choose files" onChange={(e) => { if (e.target.files) choose(e.target.files); e.target.value = ""; }} />
          <Button type="button" onClick={() => input.current?.click()} className="mt-5 bg-orange-500 text-white hover:bg-orange-600">Choose files</Button>
          <label className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={asPlaylist} onChange={(e) => setAsPlaylist(e.target.checked)} className="accent-orange-500" /> Make a playlist when multiple files are selected
          </label>
        </div>
        {quota && (
          <div className="mt-6" aria-label="Upload time">
            {quota.limitMs === null ? (
              <p className="text-sm text-zinc-400">Unlimited upload time (Pro). {minutes(quota.usedMs)} min used.</p>
            ) : (
              <>
                <p className="mb-1 text-sm text-zinc-400">{minutes(quota.usedMs)} of {minutes(quota.limitMs)} minutes used</p>
                <Progress value={Math.min(100, (quota.usedMs / quota.limitMs) * 100)} className="h-1.5" />
                {quota.remainingMs === 0 && <p role="alert" className="mt-2 text-sm text-amber-300">You&apos;ve used all your upload time. Delete tracks to free some up, or <Link href="/settings/plan" className="underline">upgrade to Pro</Link>.</p>}
              </>
            )}
          </div>
        )}
        {rejected.length > 0 && <RejectedList rejected={rejected} />}
      </div>
    );
  }

  const stacked = items.length > 1 && !asPlaylist;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{items.length === 1 ? "Upload a track" : stacked ? "Upload tracks" : "Upload a release"}</h1>
        <div className="w-full max-w-xs text-xs text-zinc-400" aria-live="polite">
          <p data-testid="batch-progress">{readyCount} of {items.length} ready{busy ? "" : ""}</p>
          <Progress value={(readyCount / items.length) * 100} className="mt-1 h-1" />
        </div>
        <Button type="button" variant="ghost" onClick={() => { if (window.confirm("Discard these uploads?")) reset(); }} className="text-zinc-400 hover:bg-zinc-800">Cancel</Button>
      </div>
      {overQuota && <p role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">These files need {formatDuration(readyMs / 1000)} but you have {formatDuration((quota?.remainingMs ?? 0) / 1000)} of upload time left. Remove some, or <Link href="/settings/plan" className="underline">upgrade to Pro</Link>.</p>}
      {rejected.length > 0 && <RejectedList rejected={rejected} />}

      {items.length === 1 && <SingleTrackStage item={items[0]!} username={username} plan={plan} />}
      {items.length > 1 && !stacked && <ReleaseStage username={username} plan={plan} />}
      {stacked && (
        <div className="space-y-5">
          {items.map((item) => (
            <SingleTrackStage key={item.id} item={item} username={username} plan={plan} showSave={!saved[item.id]} saved={Boolean(saved[item.id])} onSaved={(permalink) => setSaved((s) => ({ ...s, [item.id]: permalink }))} />
          ))}
          <Button
            type="button"
            disabled={create.isPending || items.some((i) => i.state !== "ready" && !saved[i.id])}
            onClick={() => {
              void (async () => {
                for (const item of items.filter((i) => !saved[i.id])) {
                  try {
                    const result = await create.mutateAsync({ ...Object.fromEntries(Object.entries(item.fields).filter(([, v]) => v !== undefined && v !== "")), title: item.fields.title.trim(), mediaAssetId: item.mediaAssetId! });
                    setSaved((s) => ({ ...s, [item.id]: result.permalink }));
                  } catch {
                    toast.error(`Could not save “${item.fields.title}”`);
                    return;
                  }
                }
                useUploadBatch.getState().clearPublished();
                router.push(`/${username}`);
              })();
            }}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            Publish all
          </Button>
        </div>
      )}
    </div>
  );
}

function RejectedList({ rejected }: { rejected: { name: string; reason: string }[] }) {
  return (
    <ul role="alert" className="mt-4 space-y-1 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
      {rejected.map((r) => <li key={r.name}><strong>{r.name}</strong>: {r.reason}</li>)}
    </ul>
  );
}
