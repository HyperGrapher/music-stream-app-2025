"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";
import { defaultPreviewStartMs, type TrackFields } from "@/lib/track-fields";
import { useUploadBatch, type BatchItem } from "@/store/uploadBatch";
import { api } from "@/trpc/react";

import { TrackFieldsEditor } from "./EditorFields";
import { ItemStatus } from "./ItemStatus";

/** What the server receives for one item: unset values are left out so defaults apply. */
export function toServerFields(fields: TrackFields): TrackFields {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")) as TrackFields;
}

export function successSuffix(result: { visibility?: string; publishAt?: Date | null }) {
  if (result.visibility === "SCHEDULED" && result.publishAt) return `?new=scheduled&at=${encodeURIComponent(new Date(result.publishAt).toISOString())}`;
  return result.visibility === "PRIVATE" ? "?new=private" : "?new=1";
}

/** Stage B for one file (PRD 7.3, UP-10): the editor, with the file still uploading in the background. */
export function SingleTrackStage({
  item,
  username,
  plan,
  onSaved,
  saved,
  showSave = true,
}: {
  item: BatchItem;
  username: string;
  plan: "FREE" | "PRO";
  /** Stacked mode: called instead of redirecting. */
  onSaved?: (permalink: string) => void;
  saved?: boolean;
  showSave?: boolean;
}) {
  const router = useRouter();
  const { updateFields, clearPublished } = useUploadBatch();
  const create = api.upload.createTrack.useMutation();
  const audioSrc = useMemo(() => URL.createObjectURL(item.file), [item.file]);
  const ready = item.state === "ready" && item.mediaAssetId !== undefined;
  const fields = item.fields;

  const save = async () => {
    if (!ready) return;
    try {
      const result = await create.mutateAsync({
        ...toServerFields({ ...fields, previewStartMs: fields.previewStartMs ?? defaultPreviewStartMs(item.durationMs ?? 0) }),
        title: fields.title.trim(),
        mediaAssetId: item.mediaAssetId!,
      });
      if (onSaved) onSaved(result.permalink);
      else {
        clearPublished();
        router.push(`${result.permalink}${successSuffix(result)}`);
      }
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not save the track"));
    }
  };

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5" aria-label={`Track ${fields.title}`}>
      <div className="mb-4"><ItemStatus item={item} /></div>
      {saved ? (
        <p className="text-sm text-green-400">Saved.</p>
      ) : (
        <>
          <TrackFieldsEditor
            value={fields}
            onChange={(patch) => updateFields(item.id, patch)}
            plan={plan}
            mode="create"
            username={username}
            durationMs={item.durationMs}
            audioSrc={audioSrc}
          />
          {showSave && (
            <div className="mt-6 flex items-center gap-3 border-t border-zinc-800 pt-4">
              <Button type="button" disabled={!ready || !fields.title.trim() || create.isPending} onClick={() => void save()} className="bg-orange-700 text-white hover:bg-orange-800">
                {create.isPending ? "Publishing..." : "Publish"}
              </Button>
              {!ready && item.state !== "failed" && <span className="text-xs text-amber-300">To publish: wait for the file to finish uploading.</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
