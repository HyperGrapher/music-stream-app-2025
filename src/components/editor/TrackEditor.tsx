"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TrackFieldsEditor } from "@/components/upload/EditorFields";
import { ItemStatus } from "@/components/upload/ItemStatus";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";
import type { TrackFields } from "@/lib/track-fields";
import { useUploadBatch } from "@/store/uploadBatch";
import { api, type RouterOutputs } from "@/trpc/react";

import { ConfirmDialog, SecretLinkBox } from "./shared";

type Data = RouterOutputs["tracks"]["forEdit"];

const fromData = (d: Data): TrackFields => ({
  title: d.title, slug: d.slug, artistName: d.artistName, featuredArtists: d.featuredArtists, description: d.description, genre: d.genre, tags: d.tags,
  privacy: d.visibility.toLowerCase() as "public" | "private" | "scheduled", publishAt: d.publishAt, releaseDate: d.releaseDate,
  recordLabel: d.recordLabel, publisher: d.publisher, isrc: d.isrc, bpm: d.bpm, musicalKey: d.musicalKey as TrackFields["musicalKey"], explicit: d.explicit,
  buyUrl: d.buyUrl, buyTitle: d.buyTitle, license: d.license, downloadable: d.downloadable, commentsEnabled: d.commentsEnabled, statsPublic: d.statsPublic,
  embeddable: d.embeddable, previewStartMs: d.previewStartMs,
});

/** Replace the audio file of a published track (Pro, ED-3): upload + verify like a new file, then swap. */
function ReplaceAudio({ trackId, plan, onDone }: { trackId: string; plan: "FREE" | "PRO"; onDone: () => void }) {
  const { items, addFiles, clearPublished, reset } = useUploadBatch();
  const replace = api.tracks.replaceAudio.useMutation();
  const item = items[0];
  useEffect(() => () => useUploadBatch.getState().reset(), []);
  if (plan !== "PRO") {
    return <p className="text-sm text-zinc-400">Replacing the audio file keeps your comments, likes, plays and URL. <span className="rounded bg-orange-700 px-1 text-[10px] font-bold text-white">PRO</span> <Link className="underline" href="/settings/plan">See plans</Link></p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-400">Keeps comments, likes, plays and the URL. Duration and waveform follow the new file.</p>
      {!item ? (
        <input type="file" aria-label="Choose a replacement audio file" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFiles([f]); }} className="text-sm text-zinc-300" />
      ) : (
        <div className="space-y-2">
          <ItemStatus item={item} />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={item.state !== "ready" || replace.isPending}
              onClick={() => {
                replace.mutate({ id: trackId, mediaAssetId: item.mediaAssetId! }, {
                  onSuccess: () => { clearPublished(); toast.success("Audio replaced"); onDone(); },
                  onError: (error) => toast.error(friendlyError(error)),
                });
              }}
              className="bg-orange-700 text-white hover:bg-orange-800"
            >
              Replace audio
            </Button>
            <Button type="button" variant="ghost" onClick={reset} className="text-zinc-300 hover:bg-zinc-800">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** `/studio/tracks/[id]/edit`: edit everything about one track (PRD 7.5, ED-1..ED-5). */
export function TrackEditor({ initial, returnTo }: { initial: Data; returnTo: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [data, setData] = useState(initial);
  const [fields, setFields] = useState<TrackFields>(() => fromData(initial));
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = api.tracks.update.useMutation();
  const resetSecret = api.tracks.resetSecret.useMutation();
  const del = api.tracks.delete.useMutation();
  const impact = api.tracks.deleteImpact.useQuery({ id: data.id }, { enabled: deleting });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (patch: Partial<TrackFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    try {
      const { slug, ...rest } = fields;
      const result = await update.mutateAsync({
        id: data.id,
        ...rest,
        slug,
        title: fields.title.trim(),
        // empty strings mean "cleared"
        buyUrl: fields.buyUrl || null,
      });
      setDirty(false);
      await utils.tracks.forEdit.invalidate();
      // The return target may be the old permalink: send people to the current one then.
      router.push(returnTo.startsWith(`/${data.username}/${data.slug}`) && result.slug !== data.slug ? result.permalink : returnTo);
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not save"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pt-8 pb-48 text-white">
      <header>
        <p className="text-xs tracking-wide text-orange-400 uppercase">Edit track</p>
        <h1 className="text-2xl font-bold">{data.title}</h1>
        {data.moderationState === "REMOVED" && <p role="alert" className="mt-2 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">This track was removed by moderators and is hidden from everyone but you.</p>}
        {data.collections.length > 0 && <p className="mt-1 text-xs text-zinc-400">In: {data.collections.map((c) => c.title).join(", ")}</p>}
      </header>

      <TrackFieldsEditor value={fields} onChange={change} plan={data.plan} mode="edit" username={data.username} trackId={data.id} durationMs={data.durationMs} audioSrc={`/api/tracks/${data.id}/stream`} currentArtworkUrl={data.artworkUrl} />

      {data.visibility !== "PUBLIC" && (
        <SecretLinkBox
          path={`/${data.username}/${data.slug}`}
          token={data.secretToken}
          resetting={resetSecret.isPending}
          onReset={() => resetSecret.mutate({ id: data.id }, { onSuccess: (r) => { setData({ ...data, secretToken: r.secretToken }); toast.success("New secret link created"); } })}
        />
      )}

      <section aria-label="Replace audio" className="space-y-2 border-t border-zinc-800 pt-6">
        <h2 className="text-sm font-bold uppercase">Audio file</h2>
        <ReplaceAudio trackId={data.id} plan={data.plan} onDone={() => { void utils.tracks.forEdit.invalidate(); router.refresh(); }} />
      </section>

      <section aria-label="Delete" className="space-y-2 border-t border-zinc-800 pt-6">
        <h2 className="text-sm font-bold uppercase text-red-400">Delete track</h2>
        <Button type="button" variant="outline" onClick={() => setDeleting(true)} className="border-red-500/60 bg-transparent text-red-400 hover:bg-red-500/10">Delete this track</Button>
      </section>

      <div className="sticky bottom-24 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
        <Button type="button" disabled={!fields.title.trim() || update.isPending} onClick={() => void save()} className="bg-orange-700 text-white hover:bg-orange-800">{update.isPending ? "Saving..." : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => { if (!dirty || window.confirm("Discard your changes?")) router.push(returnTo); }} className="text-zinc-300 hover:bg-zinc-800">Cancel</Button>
        {dirty && <span className="text-xs text-zinc-400">Unsaved changes</span>}
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${data.title}”?`}
        confirmLabel="Delete forever"
        busy={del.isPending || !impact.data}
        onConfirm={() => del.mutate({ id: data.id }, { onSuccess: () => { toast.success("Track deleted"); router.push(`/${data.username}`); router.refresh(); }, onError: (e) => toast.error(friendlyError(e)) })}
      >
        {impact.data ? (
          <p>
            This removes {impact.data.comments} {impact.data.comments === 1 ? "comment" : "comments"}, {impact.data.likes} {impact.data.likes === 1 ? "like" : "likes"} and {impact.data.reposts} {impact.data.reposts === 1 ? "repost" : "reposts"}, and takes it out of {impact.data.collections} {impact.data.collections === 1 ? "playlist or release" : "playlists and releases"}. It can&apos;t be undone.
          </p>
        ) : <p>Checking what this affects...</p>}
      </ConfirmDialog>
    </div>
  );
}
