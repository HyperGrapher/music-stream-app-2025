"use client";

import { Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ImageUploader } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { GENRES } from "@/lib/genres";
import { normalizeTags, slugBase } from "@/lib/names";
import { LICENSES, MUSICAL_KEYS, type TrackFields } from "@/lib/track-fields";
import { formatDuration } from "@/lib/utils";
import { api } from "@/trpc/react";

export const field = "border-zinc-700 bg-zinc-900 text-white";
export const selectClass = "h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white";

export function Labelled({ text, hint, error, children }: { text: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-300">{text}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

/** PL-4: gated controls stay visible with a PRO tag; using one opens the upsell instead of failing silently. */
export function ProTag({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ml-2 rounded bg-orange-700 px-1.5 py-0.5 text-[10px] font-bold text-white" aria-label="Pro feature">
      PRO
    </button>
  );
}

export function UpsellDialog({ open, onClose, feature }: { open: boolean; onClose: () => void; feature: string }) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{feature} is a Pro feature</DialogTitle>
          <DialogDescription className="text-zinc-400">Switch to Pro in your settings (a demo upgrade, no payment is taken) to use it.</DialogDescription>
        </DialogHeader>
        <Button asChild className="bg-orange-700 text-white hover:bg-orange-800">
          <Link href="/settings/plan">See plans</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Chip input for tags (7.3): Enter or comma adds, up to 30, normalised the way the server stores them. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (!draft.trim()) return;
    onChange(normalizeTags([...value, ...draft.split(",")]));
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 p-1.5">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
          {tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={commit}
        placeholder={value.length >= 30 ? "30 tags is the maximum" : "Add a tag and press Enter"}
        disabled={value.length >= 30}
        aria-label="Tags"
        className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-white outline-none placeholder:text-zinc-400"
      />
    </div>
  );
}

/** Canonical genres, or "Custom" free text stored as a slug (7.3). */
export function GenreField({ value, onChange }: { value: string | null | undefined; onChange: (genre: string | null) => void }) {
  const known = GENRES.some((g) => g.value === value);
  const [custom, setCustom] = useState(Boolean(value) && !known);
  return (
    <div className="space-y-2">
      <select
        aria-label="Genre"
        className={selectClass}
        value={custom ? "__custom" : (value ?? "")}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            onChange(null);
          } else {
            setCustom(false);
            onChange(e.target.value || null);
          }
        }}
      >
        <option value="">None</option>
        {GENRES.map((g) => (
          <option key={g.value} value={g.value}>{g.label}</option>
        ))}
        <option value="__custom">Custom...</option>
      </select>
      {custom && <Input aria-label="Custom genre" value={value ?? ""} maxLength={30} onChange={(e) => onChange(e.target.value || null)} placeholder="Your genre" className={field} />}
    </div>
  );
}

/** "2030-05-06T18:30" in the user's time zone <-> an instant. */
export const toLocalInput = (date: Date | null | undefined) => {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Privacy = "public" | "private" | "scheduled";

export function PrivacyField({
  privacy,
  publishAt,
  onChange,
  plan,
  onUpsell,
  allowSchedule = true,
}: {
  privacy: Privacy;
  publishAt: Date | null | undefined;
  onChange: (patch: { privacy: Privacy; publishAt?: Date | null }) => void;
  plan: "FREE" | "PRO";
  onUpsell: (feature: string) => void;
  allowSchedule?: boolean;
}) {
  const options: { value: Privacy; label: string; hint: string }[] = [
    { value: "public", label: "Public", hint: "Everyone can listen." },
    { value: "private", label: "Private", hint: "Only you and people with the secret link." },
    ...(allowSchedule ? [{ value: "scheduled" as const, label: "Schedule", hint: "Goes public at a time you choose." }] : []),
  ];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-zinc-300">Privacy</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Privacy">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={privacy === option.value}
            title={option.hint}
            onClick={() => {
              if (option.value === "scheduled" && plan !== "PRO") return onUpsell("Scheduled releases");
              onChange({ privacy: option.value, ...(option.value === "scheduled" && !publishAt ? { publishAt: new Date(Date.now() + 24 * 3_600_000) } : {}) });
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${privacy === option.value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}
          >
            {option.label}
            {option.value === "scheduled" && plan !== "PRO" && <span className="ml-1.5 rounded bg-orange-700 px-1 text-[10px] font-bold text-white">PRO</span>}
          </button>
        ))}
      </div>
      {privacy === "scheduled" && (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-zinc-300">Publish at (your time zone)</span>
          <Input
            type="datetime-local"
            value={toLocalInput(publishAt)}
            onChange={(e) => onChange({ privacy: "scheduled", publishAt: e.target.value ? new Date(e.target.value) : null })}
            className={`${field} max-w-xs`}
          />
        </label>
      )}
    </fieldset>
  );
}

/** Square artwork picker: uploads through the image pipeline and keeps a local preview. */
export function ArtworkField({
  currentUrl,
  onUploaded,
  onRemove,
  help,
  label = "Artwork",
}: {
  currentUrl?: string | null;
  onUploaded: (assetId: string) => void;
  onRemove?: () => void;
  help?: string;
  label?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? currentUrl ?? null;
  return (
    <div className="flex items-start gap-4">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-md bg-zinc-900">
        {shown ? <img src={shown} alt={`${label} preview`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-zinc-400">No artwork</div>}
      </div>
      <div className="space-y-2">
        <ImageUploader purpose="ARTWORK" label={shown ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`} onUploaded={(id, url) => { setPreview(url); onUploaded(id); }} />
        {shown && onRemove && (
          <Button type="button" variant="ghost" size="sm" className="text-zinc-400 hover:bg-zinc-800" onClick={() => { setPreview(null); onRemove(); }}>
            Remove
          </Button>
        )}
        <p className="text-xs text-zinc-400">{help ?? "JPEG, PNG or WebP up to 10 MB. 800x800 or larger works best; it is cropped to a square."}</p>
      </div>
    </div>
  );
}

/** The 30 s preview window (7.3 Advanced): pick where it starts and listen to it. */
export function PreviewPicker({ durationMs, startMs, onChange, audioSrc }: { durationMs: number; startMs: number; onChange: (ms: number) => void; audioSrc?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const max = Math.max(0, durationMs - 30_000);
  useEffect(() => {
    const node = audio.current;
    if (!node) return;
    const stop = () => {
      if (node.currentTime * 1000 >= startMs + 30_000) {
        node.pause();
        setPlaying(false);
      }
    };
    node.addEventListener("timeupdate", stop);
    node.addEventListener("ended", () => setPlaying(false));
    return () => node.removeEventListener("timeupdate", stop);
  }, [startMs]);
  return (
    <div className="space-y-2">
      <input
        type="range"
        min={0}
        max={max}
        step={1000}
        value={Math.min(startMs, max)}
        disabled={max === 0}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Preview start"
        className="w-full accent-orange-500"
      />
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>
          Preview {formatDuration(Math.min(startMs, max) / 1000)} - {formatDuration((Math.min(startMs, max) + Math.min(30_000, durationMs)) / 1000)} of {formatDuration(durationMs / 1000)}
        </span>
        {audioSrc && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
            onClick={() => {
              const node = audio.current;
              if (!node) return;
              if (playing) {
                node.pause();
                setPlaying(false);
              } else {
                node.currentTime = Math.min(startMs, max) / 1000;
                void node.play();
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Preview
          </Button>
        )}
      </div>
      {audioSrc && <audio ref={audio} src={audioSrc} preload="none" />}
    </div>
  );
}

export interface TrackFieldsEditorProps {
  value: TrackFields;
  onChange: (patch: Partial<TrackFields>) => void;
  plan: "FREE" | "PRO";
  mode: "create" | "edit";
  username: string;
  durationMs?: number;
  audioSrc?: string;
  /** Edit mode: the track being edited (slug availability ignores it). */
  trackId?: string;
  currentArtworkUrl?: string | null;
  /** Hide the permalink field (e.g. in a release, where slugs follow the titles). */
  hidePermalink?: boolean;
  /** Collections cannot be scheduled; their tracks can. */
  errors?: Record<string, string>;
}

/** The four tabs of the single-track editor (PRD 7.3). Used by upload, release rows and the edit page. */
export function TrackFieldsEditor({ value, onChange, plan, mode, username, durationMs, audioSrc, trackId, currentArtworkUrl, hidePermalink, errors = {} }: TrackFieldsEditorProps) {
  const [upsell, setUpsell] = useState<string | null>(null);
  const privacy: Privacy = value.privacy ?? "public";
  const slug = value.slug ?? "";
  const slugCheck = api.tracks.checkSlug.useQuery({ slug, selfId: trackId }, { enabled: slug.length > 0 });

  return (
    <>
      <Tabs defaultValue="basic">
        <TabsList className="mb-4 bg-zinc-900">
          <TabsTrigger value="basic">Basic info</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <ArtworkField currentUrl={currentArtworkUrl} onUploaded={(id) => onChange({ artworkAssetId: id })} onRemove={() => onChange({ artworkAssetId: null })} help="Optional: without artwork your avatar is used in feeds and cards." />
          <Labelled text="Title" error={errors.title} hint="1-100 characters. Emoji work but are discouraged.">
            <Input value={value.title} maxLength={100} onChange={(e) => onChange({ title: e.target.value })} className={field} />
          </Labelled>
          {!hidePermalink && (
            <Labelled text="Permalink" hint={slug ? undefined : `Generated from the title: /${username}/${slugBase(value.title || "untitled")}`} error={slugCheck.data && !slugCheck.data.available ? (slugCheck.data.reason === "TAKEN" ? "That permalink is taken." : "That permalink isn't allowed.") : errors.slug}>
              <span className="flex items-center gap-1 text-sm text-zinc-400">
                /{username}/
                <Input aria-label="Permalink" value={slug} maxLength={80} onChange={(e) => onChange({ slug: e.target.value.toLowerCase() || undefined })} placeholder={slugBase(value.title || "untitled")} className={field} />
              </span>
            </Labelled>
          )}
          <Labelled text="Main artist" hint="Defaults to your display name.">
            <Input value={value.artistName ?? ""} maxLength={100} onChange={(e) => onChange({ artistName: e.target.value || null })} className={field} />
          </Labelled>
          <Labelled text="Genre"><GenreField value={value.genre} onChange={(genre) => onChange({ genre })} /></Labelled>
          <Labelled text={`Tags (${value.tags?.length ?? 0}/30)`}>
            <TagInput value={value.tags ?? []} onChange={(tags) => onChange({ tags })} />
          </Labelled>
          <Labelled text={`Description (${(value.description ?? "").length}/4000)`} hint="Links, @username mentions and #tags are linked.">
            <Textarea value={value.description ?? ""} maxLength={4000} rows={4} onChange={(e) => onChange({ description: e.target.value || null })} className={field} />
          </Labelled>
          <PrivacyField privacy={privacy} publishAt={value.publishAt} plan={plan} onUpsell={setUpsell} onChange={(patch) => onChange(patch)} />
          {errors.publishAt && <p role="alert" className="text-xs text-red-400">{errors.publishAt}</p>}
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <Labelled text="Featured artists"><Input value={value.featuredArtists ?? ""} maxLength={200} onChange={(e) => onChange({ featuredArtists: e.target.value || null })} className={field} /></Labelled>
          <Labelled text="Release date">
            <Input type="date" value={value.releaseDate ? new Date(value.releaseDate).toISOString().slice(0, 10) : ""} onChange={(e) => onChange({ releaseDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`) : null })} className={`${field} max-w-xs`} />
          </Labelled>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled text="Record label"><Input value={value.recordLabel ?? ""} maxLength={100} onChange={(e) => onChange({ recordLabel: e.target.value || null })} className={field} /></Labelled>
            <Labelled text="Publisher"><Input value={value.publisher ?? ""} maxLength={100} onChange={(e) => onChange({ publisher: e.target.value || null })} className={field} /></Labelled>
          </div>
          <Labelled text="ISRC" hint="Format CC-XXX-YY-NNNNN (hyphens optional)." error={errors.isrc}>
            <Input value={value.isrc ?? ""} maxLength={20} onChange={(e) => onChange({ isrc: e.target.value || null })} className={`${field} max-w-xs`} />
          </Labelled>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled text="BPM" error={errors.bpm}>
              <Input type="number" min={20} max={300} value={value.bpm ?? ""} onChange={(e) => onChange({ bpm: e.target.value ? Number(e.target.value) : null })} className={field} />
            </Labelled>
            <Labelled text="Key">
              <select aria-label="Key" className={selectClass} value={value.musicalKey ?? ""} onChange={(e) => onChange({ musicalKey: (e.target.value || null) as TrackFields["musicalKey"] })}>
                <option value="">None</option>
                {MUSICAL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Labelled>
          </div>
          <div className="flex items-center justify-between rounded border border-zinc-800 p-3 text-sm">
            <span>Explicit content (shows an “E” badge)</span>
            <Switch checked={value.explicit ?? false} onCheckedChange={(explicit) => onChange({ explicit })} aria-label="Explicit content" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled text="Buy link" hint="An https:// link." error={errors.buyUrl}><Input value={value.buyUrl ?? ""} maxLength={300} onChange={(e) => onChange({ buyUrl: e.target.value || null })} className={field} /></Labelled>
            <Labelled text="Buy link title" hint="Default “Buy”."><Input value={value.buyTitle ?? ""} maxLength={30} onChange={(e) => onChange({ buyTitle: e.target.value || null })} className={field} /></Labelled>
          </div>
          <Labelled text="License" hint={LICENSES.find((l) => l.value === (value.license ?? "ALL_RIGHTS_RESERVED"))?.hint}>
            <select aria-label="License" className={selectClass} value={value.license ?? "ALL_RIGHTS_RESERVED"} onChange={(e) => onChange({ license: e.target.value })}>
              {LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Labelled>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-3">
          {[
            { key: "downloadable" as const, label: "Enable downloads", hint: "Listeners must be signed in to download.", def: false },
            { key: "commentsEnabled" as const, label: "Allow comments", hint: "Turn off to hide the comment box and existing comments from others.", def: true },
            { key: "embeddable" as const, label: "Allow embedding", hint: "Lets other sites embed your player.", def: true },
          ].map((row) => (
            <div key={row.key} className="flex items-start justify-between gap-4 rounded border border-zinc-800 p-3">
              <div><p className="text-sm font-medium">{row.label}</p><p className="text-xs text-zinc-400">{row.hint}</p></div>
              <Switch checked={value[row.key] ?? row.def} onCheckedChange={(checked) => onChange({ [row.key]: checked })} aria-label={row.label} />
            </div>
          ))}
          <div className="flex items-start justify-between gap-4 rounded border border-zinc-800 p-3">
            <div>
              <p className="text-sm font-medium">Display stats publicly{plan !== "PRO" && <ProTag onClick={() => setUpsell("Quiet Mode")} />}</p>
              <p className="text-xs text-zinc-400">Turn off (Quiet Mode) to hide play, like, repost and comment counts from everyone but you.</p>
            </div>
            <Switch
              checked={value.statsPublic ?? true}
              onCheckedChange={(checked) => (!checked && plan !== "PRO" ? setUpsell("Quiet Mode") : onChange({ statsPublic: checked }))}
              aria-label="Display stats publicly"
            />
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Labelled text="Audio preview (30 s)" hint="The clip shown when someone hovers the track on Discover.">
            {durationMs ? <PreviewPicker durationMs={durationMs} startMs={value.previewStartMs ?? 0} onChange={(previewStartMs) => onChange({ previewStartMs })} audioSrc={audioSrc} /> : <span className="text-xs text-zinc-400">Available once the file is analysed.</span>}
          </Labelled>
          {mode === "create" && <p className="text-xs text-zinc-400">You can change everything here later from the track&apos;s Edit page.</p>}
        </TabsContent>
      </Tabs>
      <UpsellDialog open={upsell !== null} onClose={() => setUpsell(null)} feature={upsell ?? ""} />
    </>
  );
}
