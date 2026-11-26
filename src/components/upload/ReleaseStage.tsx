"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COLLECTION_TYPES, isReleaseType, type CollectionTypeValue } from "@/lib/collection-fields";
import { friendlyError } from "@/lib/error-messages";
import { slugBase } from "@/lib/names";
import { LICENSES, type TrackFields } from "@/lib/track-fields";
import { formatDuration } from "@/lib/utils";
import { useUploadBatch, type BatchItem } from "@/store/uploadBatch";
import { api } from "@/trpc/react";

import { ArtworkField, field, GenreField, Labelled, selectClass, TagInput, TrackFieldsEditor } from "./EditorFields";
import { ItemStatus } from "./ItemStatus";
import { toServerFields } from "./SingleTrackStage";

/** UP-14 / ED-9: public release, but some tracks are private. */
export function privateTrackCount(releasePrivacy: "public" | "private", tracks: { privacy?: string }[]) {
  return releasePrivacy === "public" ? tracks.filter((t) => (t.privacy ?? "public") !== "public").length : 0;
}

function Row({ item, index, username, plan, selected, onSelect }: { item: BatchItem; index: number; username: string; plan: "FREE" | "PRO"; selected: boolean; onSelect: (on: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const { updateFields, remove } = useUploadBatch();
  const [open, setOpen] = useState(false);
  const audioSrc = useMemo(() => URL.createObjectURL(item.file), [item.file]);
  const privacy = item.fields.privacy ?? "public";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="rounded-lg border border-zinc-800 bg-zinc-950"
      data-testid="release-row"
    >
      <div className="flex items-center gap-3 p-3">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${item.fields.title}`} className="h-4 w-4 accent-orange-500" />
        <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${item.fields.title}. Press space to lift, arrow keys to move.`} className="cursor-grab touch-none text-zinc-500 hover:text-white">
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="w-6 text-sm text-zinc-500">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <Input aria-label={`Title of track ${index + 1}`} value={item.fields.title} maxLength={100} onChange={(e) => updateFields(item.id, { title: e.target.value })} className={`${field} h-8`} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <ItemStatus item={item} compact />
            {item.durationMs && <span>{formatDuration(item.durationMs / 1000)}</span>}
            {item.fields.artistName && <span>{item.fields.artistName}</span>}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${privacy === "public" ? "bg-zinc-800 text-zinc-300" : "bg-amber-500/15 text-amber-300"}`}>
          {privacy === "private" && <Lock className="mr-1 inline h-3 w-3" />}
          {privacy === "public" ? "Public" : privacy === "private" ? "Private" : "Scheduled"}
        </span>
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="text-zinc-300 hover:bg-zinc-800">
          Edit details <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${item.fields.title}`} onClick={() => remove(item.id)} className="text-zinc-400 hover:bg-zinc-800">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="border-t border-zinc-800 p-4">
          <TrackFieldsEditor value={item.fields} onChange={(patch) => updateFields(item.id, patch)} plan={plan} mode="create" username={username} durationMs={item.durationMs} audioSrc={audioSrc} hidePermalink />
        </div>
      )}
    </li>
  );
}

/** Stage B for several files created as a collection (PRD 7.4): release details + ordered track list. */
export function ReleaseStage({ username, plan }: { username: string; plan: "FREE" | "PRO" }) {
  const router = useRouter();
  const { items, move, updateFields, setSelected, clearPublished } = useUploadBatch();
  const create = api.upload.createCollection.useMutation();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<CollectionTypeValue>("ALBUM");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [genre, setGenre] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [applyToAll, setApplyToAll] = useState(true);
  const [description, setDescription] = useState("");
  const [label, setLabel] = useState("");
  const [publisher, setPublisher] = useState("");
  const [license, setLicense] = useState("ALL_RIGHTS_RESERVED");
  const [privacy, setPrivacy] = useState<"public" | "private">("public");
  const [artworkId, setArtworkId] = useState<string | null>(null);
  const [useArtwork, setUseArtwork] = useState(true);
  const [bulk, setBulk] = useState<{ artist: string; genre: string | null; tags: string[]; tagMode: "add" | "replace" }>({ artist: "", genre: null, tags: [], tagMode: "add" });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    const from = items.findIndex((i) => i.id === event.active.id);
    const to = items.findIndex((i) => i.id === event.over?.id);
    if (from >= 0 && to >= 0 && from !== to) move(from, to);
  };

  const ready = items.length > 0 && items.every((i) => i.state === "ready");
  const needsDate = isReleaseType(type) && !releaseDate;
  const hiddenCount = privateTrackCount(privacy, items.map((i) => i.fields));
  const targets = (items.some((i) => i.selected) ? items.filter((i) => i.selected) : items);
  const applyBulk = (patch: Partial<TrackFields>) => targets.forEach((i) => updateFields(i.id, patch));
  const valid = title.trim().length > 0 && ready && !needsDate;

  const save = async () => {
    try {
      const result = await create.mutateAsync({
        title: title.trim(),
        slug: slug || undefined,
        type,
        description: description || null,
        genre,
        tags,
        privacy,
        releaseDate: releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : null,
        recordLabel: label || null,
        publisher: publisher || null,
        license,
        artworkAssetId: artworkId,
        useArtworkForTracks: useArtwork,
        tracks: items.map((item) => ({
          ...toServerFields({
            ...item.fields,
            // "Apply genre and tags to all tracks" off: tracks keep only what they have themselves.
            ...(applyToAll ? {} : { genre: item.fields.genre ?? null, tags: item.fields.tags ?? [] }),
          }),
          title: item.fields.title.trim(),
          mediaAssetId: item.mediaAssetId!,
        })),
      });
      clearPublished();
      router.push(`${result.permalink}?new=${privacy === "private" ? "private" : "1"}`);
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not save the release"));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5" aria-label="Release details">
        <ArtworkField label="Release artwork" onUploaded={setArtworkId} onRemove={() => setArtworkId(null)} help="Release artwork doesn't replace each track's own artwork." />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={useArtwork} onChange={(e) => setUseArtwork(e.target.checked)} className="accent-orange-500" /> Use for tracks without artwork
        </label>
        <Labelled text="Release title">
          <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={`${field} h-11 text-lg font-semibold`} />
        </Labelled>
        <Labelled text="Permalink" hint={slug ? undefined : `/${username}/sets/${slugBase(title || "untitled")}`}>
          <Input aria-label="Permalink" value={slug} maxLength={80} placeholder={slugBase(title || "untitled")} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={field} />
        </Labelled>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-zinc-300">Type</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Type">
            {COLLECTION_TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={type === t.value} title={t.hint} onClick={() => setType(t.value)} className={`rounded-full border px-3 py-1.5 text-sm ${type === t.value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">{COLLECTION_TYPES.find((t) => t.value === type)?.hint}. Album is the default for multi-file uploads. You can change this any time.</p>
        </fieldset>
        <Labelled text={isReleaseType(type) ? "Release date (required)" : "Release date (optional)"} error={needsDate ? "Add a release date." : null}>
          <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className={`${field} max-w-xs`} />
        </Labelled>
        <Labelled text="Genre"><GenreField value={genre} onChange={setGenre} /></Labelled>
        <Labelled text="Tags"><TagInput value={tags} onChange={setTags} /></Labelled>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="accent-orange-500" /> Apply genre and tags to all tracks
        </label>
        <Labelled text="Description"><Textarea value={description} maxLength={4000} rows={3} onChange={(e) => setDescription(e.target.value)} className={field} /></Labelled>
        <div className="grid gap-3 sm:grid-cols-2">
          <Labelled text="Record label"><Input value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} className={field} /></Labelled>
          <Labelled text="Publisher"><Input value={publisher} maxLength={100} onChange={(e) => setPublisher(e.target.value)} className={field} /></Labelled>
        </div>
        <Labelled text="License">
          <select aria-label="License" className={selectClass} value={license} onChange={(e) => setLicense(e.target.value)}>
            {LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Labelled>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-zinc-300">Privacy</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Release privacy">
            {(["public", "private"] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={privacy === p} onClick={() => setPrivacy(p)} className={`rounded-full border px-3 py-1.5 text-sm capitalize ${privacy === p ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300"}`}>{p}</button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-3" aria-label="Tracks">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm" aria-label="Bulk actions">
          <span className="text-zinc-400">{items.some((i) => i.selected) ? `${items.filter((i) => i.selected).length} selected` : "All tracks"}:</span>
          <Input aria-label="Bulk artist" placeholder="Artist" value={bulk.artist} onChange={(e) => setBulk({ ...bulk, artist: e.target.value })} className={`${field} h-8 w-32`} />
          <Button type="button" size="sm" variant="outline" disabled={!bulk.artist} onClick={() => applyBulk({ artistName: bulk.artist })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">Set artist</Button>
          <select aria-label="Bulk privacy" className={`${selectClass} h-8 w-32`} defaultValue="" onChange={(e) => { if (e.target.value) applyBulk({ privacy: e.target.value as "public" | "private" }); e.target.value = ""; }}>
            <option value="">Privacy...</option><option value="public">Public</option><option value="private">Private</option>
          </select>
          <select aria-label="Bulk license" className={`${selectClass} h-8 w-36`} defaultValue="" onChange={(e) => { if (e.target.value) applyBulk({ license: e.target.value }); e.target.value = ""; }}>
            <option value="">License...</option>{LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" onClick={() => applyBulk({ downloadable: true })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">Enable downloads</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyBulk({ commentsEnabled: false })} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">Turn comments off</Button>
          <details className="w-full text-xs text-zinc-400">
            <summary className="cursor-pointer">Genre and tags for the selection</summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="w-48"><GenreField value={bulk.genre} onChange={(g) => setBulk({ ...bulk, genre: g })} /></div>
              <div className="w-64"><TagInput value={bulk.tags} onChange={(t) => setBulk({ ...bulk, tags: t })} /></div>
              <select aria-label="Tag mode" className={`${selectClass} h-8 w-28`} value={bulk.tagMode} onChange={(e) => setBulk({ ...bulk, tagMode: e.target.value as "add" | "replace" })}><option value="add">Add tags</option><option value="replace">Replace tags</option></select>
              <Button type="button" size="sm" variant="outline" onClick={() => targets.forEach((i) => updateFields(i.id, { ...(bulk.genre ? { genre: bulk.genre } : {}), ...(bulk.tags.length ? { tags: bulk.tagMode === "add" ? [...new Set([...(i.fields.tags ?? []), ...bulk.tags])] : bulk.tags } : {}) }))} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">Apply</Button>
            </div>
          </details>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {items.map((item, index) => (
                <Row key={item.id} item={item} index={index} username={username} plan={plan} selected={item.selected} onSelect={(on) => setSelected(item.id, on)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {hiddenCount > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" data-testid="privacy-warning">
            <span>This release is public, but {hiddenCount} {hiddenCount === 1 ? "track is" : "tracks are"} private and won&apos;t be playable by listeners.</span>
            <Button type="button" size="sm" onClick={() => items.forEach((i) => updateFields(i.id, { privacy: "public" }))} className="bg-amber-500 text-black hover:bg-amber-400">Make all tracks public</Button>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-zinc-800 pt-4">
          <Button type="button" disabled={!valid || create.isPending} onClick={() => void save()} className="bg-orange-500 text-white hover:bg-orange-600">
            {create.isPending ? "Saving..." : "Save"}
          </Button>
          {!ready && <span className="text-xs text-zinc-500">Save unlocks when every file is ready (failed ones must be retried or removed).</span>}
        </div>
      </section>
    </div>
  );
}
