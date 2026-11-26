"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ArtworkField, field, GenreField, Labelled, selectClass, TagInput } from "@/components/upload/EditorFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { COLLECTION_TYPES, isReleaseType, type CollectionTypeValue } from "@/lib/collection-fields";
import { friendlyError } from "@/lib/error-messages";
import { LICENSES } from "@/lib/track-fields";
import { formatDuration } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";

import { ConfirmDialog, SecretLinkBox } from "./shared";

type Data = RouterOutputs["collections"]["forEdit"];
type Entry = Data["tracks"][number];

function SortableTrack({ entry, onRemove }: { entry: Entry; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: entry.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950 p-2.5" data-testid="collection-track">
      <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${entry.title}. Press space to lift, arrow keys to move.`} className="cursor-grab touch-none text-zinc-500 hover:text-white"><GripVertical className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.title}</p>
        <p className="text-xs text-zinc-500">{entry.user?.name} · {formatDuration(entry.duration)}</p>
      </div>
      {entry.visibilityRaw !== "PUBLIC" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"><Lock className="mr-1 inline h-3 w-3" />Private</span>}
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${entry.title} from this collection`} onClick={onRemove} className="text-zinc-400 hover:bg-zinc-800"><X className="h-4 w-4" /></Button>
    </li>
  );
}

function AddTracks({ collectionId, existing, onAdded, all }: { collectionId: string; existing: Set<string>; onAdded: () => void; all: boolean }) {
  const [q, setQ] = useState("");
  const mine = api.tracks.mine.useQuery({ q: q || undefined, limit: 20 }, { enabled: !all });
  const everyone = api.discover.tracks.useQuery({ q: q || undefined, limit: 20, sort: "popular" }, { enabled: all && q.length >= 2 });
  const add = api.collections.addTracks.useMutation({ onSuccess: onAdded, onError: (e) => toast.error(friendlyError(e)) });
  const rows = (all ? everyone.data : mine.data) ?? [];
  return (
    <div className="space-y-2 rounded border border-zinc-800 p-3">
      <Input aria-label={all ? "Search all public tracks" : "Search your tracks"} placeholder={all ? "Search all public tracks" : "Add your tracks"} value={q} onChange={(e) => setQ(e.target.value)} className={field} />
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {rows.filter((t) => !existing.has(t.id)).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{t.title} <span className="text-xs text-zinc-500">{t.user?.name}</span></span>
            <Button type="button" size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate({ id: collectionId, trackIds: [t.id] })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800"><Plus className="h-3.5 w-3.5" /> Add</Button>
          </li>
        ))}
        {rows.filter((t) => !existing.has(t.id)).length === 0 && <li className="text-xs text-zinc-500">{all && q.length < 2 ? "Type at least 2 characters." : "Nothing to add."}</li>}
      </ul>
    </div>
  );
}

/** `/studio/sets/[id]/edit`: Basic info / Tracks / Metadata (PRD 7.6, ED-6..ED-11). */
export function CollectionEditor({ initial, returnTo }: { initial: Data; returnTo: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: live = initial } = api.collections.forEdit.useQuery({ id: initial.id }, { initialData: initial });
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [type, setType] = useState<CollectionTypeValue>(initial.type);
  const [releaseDate, setReleaseDate] = useState(initial.releaseDate ? new Date(initial.releaseDate).toISOString().slice(0, 10) : "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [privacy, setPrivacy] = useState<"public" | "private">(initial.visibility === "PUBLIC" ? "public" : "private");
  const [genre, setGenre] = useState<string | null>(initial.genre);
  const [tags, setTags] = useState(initial.tags);
  const [applyToTracks, setApplyToTracks] = useState(false);
  const [label, setLabel] = useState(initial.recordLabel ?? "");
  const [publisher, setPublisher] = useState(initial.publisher ?? "");
  const [license, setLicense] = useState(initial.license ?? "ALL_RIGHTS_RESERVED");
  const [artworkId, setArtworkId] = useState<string | null | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [alsoTracks, setAlsoTracks] = useState(false);
  const [secret, setSecret] = useState(initial.secretToken);
  const [searchAll, setSearchAll] = useState(false);
  const [order, setOrder] = useState(live.tracks);
  // Follow fresh server data (after add/remove) without an effect: the supported "adjust state while rendering" pattern.
  const [seenTracks, setSeenTracks] = useState(live.tracks);
  if (seenTracks !== live.tracks) {
    setSeenTracks(live.tracks);
    setOrder(live.tracks);
  }
  const update = api.collections.update.useMutation();
  const reorder = api.collections.reorder.useMutation({ onError: (e) => { toast.error(friendlyError(e)); void utils.collections.forEdit.invalidate(); } });
  const remove = api.collections.removeTrack.useMutation({ onSuccess: () => utils.collections.forEdit.invalidate(), onError: (e) => toast.error(friendlyError(e)) });
  const resetSecret = api.collections.resetSecret.useMutation();
  const del = api.collections.delete.useMutation();
  const slugCheck = api.collections.checkSlug.useQuery({ slug, selfId: initial.id }, { enabled: slug !== initial.slug && slug.length > 0 });

  const hiddenCount = privacy === "public" ? order.filter((t) => t.visibilityRaw !== "PUBLIC").length : 0;
  const ownTracks = order.filter((t) => t.ownTrack).length;
  const needsDate = isReleaseType(type) && !releaseDate;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const onDragEnd = (event: DragEndEvent) => {
    const from = order.findIndex((t) => t.id === event.active.id);
    const to = order.findIndex((t) => t.id === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    reorder.mutate({ id: initial.id, trackIds: next.map((t) => t.id) }, { onSuccess: () => void utils.collections.forEdit.invalidate() });
  };

  const save = async () => {
    try {
      const result = await update.mutateAsync({
        id: initial.id, title: title.trim(), slug, type, description: description || null, privacy, genre, tags,
        releaseDate: releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : null, recordLabel: label || null, publisher: publisher || null,
        license, applyToTracks, ...(artworkId !== undefined ? { artworkAssetId: artworkId } : {}),
      });
      setDirty(false);
      router.push(returnTo.startsWith(`/${initial.username}/sets/${initial.slug}`) ? result.permalink : returnTo);
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not save"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-48 text-white">
      <header>
        <p className="text-xs tracking-wide text-orange-400 uppercase">Edit {type === "PLAYLIST" ? "playlist" : "release"}</p>
        <h1 className="text-2xl font-bold">{initial.title}</h1>
      </header>
      <Tabs defaultValue="basic">
        <TabsList className="mb-4 bg-zinc-900">
          <TabsTrigger value="basic">Basic info</TabsTrigger>
          <TabsTrigger value="tracks">Tracks</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <ArtworkField label="Artwork" currentUrl={live.artworkUrl} onUploaded={mark(setArtworkId)} onRemove={() => { setArtworkId(null); setDirty(true); }} />
          <Labelled text="Title"><Input value={title} maxLength={100} onChange={(e) => mark(setTitle)(e.target.value)} className={field} /></Labelled>
          <Labelled text="Permalink" error={slugCheck.data && !slugCheck.data.available ? "That permalink isn't available." : null}>
            <span className="flex items-center gap-1 text-sm text-zinc-500">/{initial.username}/sets/<Input aria-label="Permalink" value={slug} maxLength={80} onChange={(e) => mark(setSlug)(e.target.value.toLowerCase())} className={field} /></span>
          </Labelled>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-zinc-300">Type</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
              {COLLECTION_TYPES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={type === t.value} title={t.hint} onClick={() => mark(setType)(t.value)} className={`rounded-full border px-3 py-1.5 text-sm ${type === t.value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300"}`}>{t.label}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-500">Changing the type moves it between your Albums and Playlists tabs. You can change it back any time.</p>
          </fieldset>
          <Labelled text={isReleaseType(type) ? "Release date (required)" : "Release date (optional)"} error={needsDate ? "Add a release date." : null}>
            <Input type="date" value={releaseDate} onChange={(e) => mark(setReleaseDate)(e.target.value)} className={`${field} max-w-xs`} />
          </Labelled>
          <Labelled text="Description"><Textarea rows={4} maxLength={4000} value={description} onChange={(e) => mark(setDescription)(e.target.value)} className={field} /></Labelled>
          <Labelled text="Genre"><GenreField value={genre} onChange={mark(setGenre)} /></Labelled>
          <Labelled text="Tags"><TagInput value={tags} onChange={mark(setTags)} /></Labelled>
          <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={applyToTracks} onChange={(e) => mark(setApplyToTracks)(e.target.checked)} className="accent-orange-500" /> Apply genre and tags to my tracks in this collection</label>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-zinc-300">Privacy</legend>
            <div className="flex gap-2" role="radiogroup" aria-label="Privacy">
              {(["public", "private"] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={privacy === p} onClick={() => mark(setPrivacy)(p)} className={`rounded-full border px-3 py-1.5 text-sm capitalize ${privacy === p ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300"}`}>{p}</button>)}
            </div>
          </fieldset>
          {privacy === "private" && <SecretLinkBox path={`/${initial.username}/sets/${initial.slug}`} token={secret} resetting={resetSecret.isPending} onReset={() => resetSecret.mutate({ id: initial.id }, { onSuccess: (r) => { setSecret(r.secretToken); toast.success("New secret link created"); } })} />}
        </TabsContent>

        <TabsContent value="tracks" className="space-y-4">
          <p className="text-sm text-zinc-400" aria-live="polite">{order.length} {order.length === 1 ? "track" : "tracks"} · {formatDuration(order.reduce((s, t) => s + t.duration, 0))}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">{order.map((entry) => <SortableTrack key={entry.id} entry={entry} onRemove={() => remove.mutate({ id: initial.id, trackId: entry.id })} />)}</ul>
            </SortableContext>
          </DndContext>
          <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={searchAll} onChange={(e) => setSearchAll(e.target.checked)} className="accent-orange-500" /> Search all public tracks, not just mine</label>
          <AddTracks collectionId={initial.id} existing={new Set(order.map((t) => t.id))} all={searchAll} onAdded={() => void utils.collections.forEdit.invalidate()} />
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled text="Record label"><Input value={label} maxLength={100} onChange={(e) => mark(setLabel)(e.target.value)} className={field} /></Labelled>
            <Labelled text="Publisher"><Input value={publisher} maxLength={100} onChange={(e) => mark(setPublisher)(e.target.value)} className={field} /></Labelled>
          </div>
          <Labelled text="License" hint="Applies to your tracks in this collection that have no label or publisher of their own; license is a default for new tracks.">
            <select aria-label="License" className={selectClass} value={license} onChange={(e) => mark(setLicense)(e.target.value as typeof license)}>{LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </Labelled>
        </TabsContent>
      </Tabs>

      {hiddenCount > 0 && <p role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" data-testid="privacy-warning">This collection is public, but {hiddenCount} {hiddenCount === 1 ? "track is" : "tracks are"} private and won&apos;t be playable by listeners.</p>}

      <section className="space-y-2 border-t border-zinc-800 pt-6" aria-label="Delete">
        <h2 className="text-sm font-bold uppercase text-red-400">Delete</h2>
        <Button type="button" variant="outline" onClick={() => setDeleting(true)} className="border-red-500/60 bg-transparent text-red-400 hover:bg-red-500/10">Delete this {type === "PLAYLIST" ? "playlist" : "release"}</Button>
      </section>

      <div className="sticky bottom-24 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur">
        <Button type="button" disabled={!title.trim() || needsDate || update.isPending} onClick={() => void save()} className="bg-orange-500 text-white hover:bg-orange-600">{update.isPending ? "Saving..." : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => { if (!dirty || window.confirm("Discard your changes?")) router.push(returnTo); }} className="text-zinc-300 hover:bg-zinc-800">Cancel</Button>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete “${initial.title}”?`}
        confirmLabel={alsoTracks ? `Delete it and ${ownTracks} ${ownTracks === 1 ? "track" : "tracks"}` : "Delete"}
        busy={del.isPending}
        onConfirm={() => del.mutate({ id: initial.id, deleteTracks: alsoTracks }, { onSuccess: () => { toast.success("Deleted"); router.push(`/${initial.username}`); router.refresh(); }, onError: (e) => toast.error(friendlyError(e)) })}
      >
        {ownTracks > 0 ? (
          <fieldset className="space-y-2">
            <label className="flex items-start gap-2"><input type="radio" name="del" checked={!alsoTracks} onChange={() => setAlsoTracks(false)} className="mt-1 accent-orange-500" /> Delete only the {type === "PLAYLIST" ? "playlist" : "release"} (the tracks stay)</label>
            <label className="flex items-start gap-2"><input type="radio" name="del" checked={alsoTracks} onChange={() => setAlsoTracks(true)} className="mt-1 accent-orange-500" /> Delete it and its {ownTracks} {ownTracks === 1 ? "track" : "tracks"}. Other people&apos;s tracks are never deleted.</label>
          </fieldset>
        ) : <p>This can&apos;t be undone.</p>}
      </ConfirmDialog>
    </div>
  );
}
