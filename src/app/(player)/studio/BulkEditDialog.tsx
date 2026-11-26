"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { TagInput, UpsellDialog } from "@/components/upload/EditorFields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { GENRES } from "@/lib/genres";
import { LICENSES } from "@/lib/track-fields";
import { api } from "@/trpc/react";

type Tri = "keep" | "on" | "off";
const sel = "rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white";

/** ST-2: change one or several fields of every selected track at once, with a preview of how many tracks will change. */
export function BulkEditDialog({ ids, plan, open, onClose, onDone }: { ids: string[]; plan: "FREE" | "PRO"; open: boolean; onClose: () => void; onDone: () => void }) {
  const [genre, setGenre] = useState("keep");
  const [tagMode, setTagMode] = useState<"add" | "remove" | "replace">("add");
  const [tags, setTags] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("keep");
  const [license, setLicense] = useState("keep");
  const [label, setLabel] = useState("");
  const [flags, setFlags] = useState<Record<"downloadable" | "commentsEnabled" | "embeddable" | "statsPublic", Tri>>({ downloadable: "keep", commentsEnabled: "keep", embeddable: "keep", statsPublic: "keep" });
  const [upsell, setUpsell] = useState<string | null>(null);

  const patch = useMemo(() => ({
    ...(genre !== "keep" ? { genre: genre === "none" ? null : genre } : {}),
    ...(tags.length ? { tags: { mode: tagMode, values: tags } } : {}),
    ...(privacy !== "keep" ? { privacy: privacy as "public" | "private" } : {}),
    ...(license !== "keep" ? { license } : {}),
    ...(label.trim() ? { recordLabel: label.trim() } : {}),
    ...Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== "keep").map(([k, v]) => [k, v === "on"])),
  }), [genre, tagMode, tags, privacy, license, label, flags]);
  const empty = Object.keys(patch).length === 0;
  const preview = api.studio.bulkPreview.useQuery({ ids, patch }, { enabled: open && !empty });
  const utils = api.useUtils();
  const update = api.studio.bulkUpdate.useMutation({
    onSuccess: (r) => { toast.success(`Updated ${r.changed} ${r.changed === 1 ? "track" : "tracks"}`); void utils.studio.tracks.invalidate(); onDone(); },
    onError: (error) => toast.error(friendlyError(error, "Could not update the tracks")),
  });
  const flag = (key: keyof typeof flags, label: string, pro = false) => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}{pro && plan !== "PRO" ? <span className="ml-2 rounded bg-orange-500/20 px-1.5 text-[10px] font-bold text-orange-300">PRO</span> : null}</span>
      <select aria-label={label} value={flags[key]} className={sel} onChange={(e) => (pro && plan !== "PRO" && e.target.value === "off" ? setUpsell("Quiet Mode") : setFlags((f) => ({ ...f, [key]: e.target.value as Tri })))}>
        <option value="keep">Keep</option><option value="on">On</option><option value="off">Off</option>
      </select>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {ids.length} {ids.length === 1 ? "track" : "tracks"}</DialogTitle>
          <DialogDescription className="text-zinc-400">Only the fields you change are applied. “Keep” leaves a field as it is.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">Genre
            <select aria-label="Genre" value={genre} className={sel} onChange={(e) => setGenre(e.target.value)}>
              <option value="keep">Keep</option><option value="none">No genre</option>
              {GENRES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">Tags
              <select aria-label="Tag mode" value={tagMode} className={sel} onChange={(e) => setTagMode(e.target.value as typeof tagMode)}>
                <option value="add">Add to existing</option><option value="remove">Remove from existing</option><option value="replace">Replace all</option>
              </select>
            </div>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">Privacy
            <select aria-label="Privacy" value={privacy} className={sel} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="keep">Keep</option><option value="public">Public</option><option value="private">Private</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">License
            <select aria-label="License" value={license} className={sel} onChange={(e) => setLicense(e.target.value)}>
              <option value="keep">Keep</option>
              {LICENSES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">Record label
            <Input aria-label="Record label" className="w-56 border-zinc-700 bg-zinc-900" value={label} maxLength={100} onChange={(e) => setLabel(e.target.value)} placeholder="Keep" />
          </label>
          <div className="space-y-2 border-t border-zinc-800 pt-3">
            {flag("downloadable", "Allow downloads")}
            {flag("commentsEnabled", "Allow comments")}
            {flag("embeddable", "Allow embeds")}
            {flag("statsPublic", "Show stats publicly", true)}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3">
            <span className="text-sm text-zinc-400" data-testid="bulk-preview">{empty ? "Nothing to change yet." : preview.data ? `${preview.data.changes} of ${preview.data.selected} will change.` : "Checking…"}</span>
            <Button disabled={empty || update.isPending || preview.data?.changes === 0} onClick={() => update.mutate({ ids, patch })} className="bg-orange-700 text-white hover:bg-orange-800">Apply</Button>
          </div>
        </div>
        <UpsellDialog open={upsell !== null} onClose={() => setUpsell(null)} feature={upsell ?? ""} />
      </DialogContent>
    </Dialog>
  );
}
