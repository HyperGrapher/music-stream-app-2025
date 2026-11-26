"use client";

import { ScrollPanel } from "@/components/ui/scroll-panel";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { UpsellDialog } from "@/components/upload/EditorFields";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

type Pick = { kind: "track" | "collection"; id: string; title: string };

/** Spotlight (SP-1, PL-3): pick up to your plan's allowance of your own public tracks and collections, in order. */
export function SpotlightEditor() {
  const utils = api.useUtils();
  const query = api.studio.spotlight.useQuery();
  const [draft, setDraft] = useState<Pick[] | null>(null);
  const [upsell, setUpsell] = useState(false);
  const save = api.studio.setSpotlight.useMutation({
    onSuccess: () => { toast.success("Spotlight saved"); setDraft(null); void utils.studio.spotlight.invalidate(); },
    onError: (e) => toast.error(friendlyError(e, "Could not save the spotlight")),
  });
  if (!query.data) return <p className="text-sm text-zinc-400">Loading…</p>;
  const { limit, options, hidden } = query.data;
  const items = draft ?? query.data.items;
  const has = (p: Pick) => items.some((i) => i.kind === p.kind && i.id === p.id);
  const set = (next: Pick[]) => setDraft(next);
  const move = (i: number, d: -1 | 1) => { const next = [...items]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x!); set(next); };
  const add = (p: Pick) => (items.length >= limit ? (limit < 5 ? setUpsell(true) : toast.error(`You can spotlight up to ${limit} items`)) : set([...items, p]));
  const all: Pick[] = [...options.tracks.map((t) => ({ kind: "track" as const, id: t.id, title: t.title })), ...options.collections.map((c) => ({ kind: "collection" as const, id: c.id, title: c.title }))];

  return (
    <div>
      <h1 className="text-2xl font-bold">Spotlight</h1>
      <p className="mt-1 text-sm text-zinc-400">Pin up to {limit} of your public tracks or collections to the top of your profile. {limit < 5 && <>Pro creators can pin 5.</>}</p>
      {hidden > 0 && <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">Your plan shows {limit} item. The other {hidden} {hidden === 1 ? "is" : "are"} kept and will show again if you upgrade.</p>}
      <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-zinc-400 uppercase">On your profile ({items.length}/{limit})</h2>
      <ol className="space-y-2" aria-label="Spotlight order">
        {items.map((p, i) => (
          <li key={`${p.kind}${p.id}`} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm" data-testid="spotlight-item">
            <span className="flex-1 truncate">{p.title} <span className="text-xs text-zinc-400">{p.kind === "track" ? "Track" : "Collection"}</span></span>
            <button aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
            <button aria-label={`Move ${p.title} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
            <button aria-label={`Remove ${p.title}`} onClick={() => set(items.filter((x) => x !== p))} className="p-1 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-zinc-400">Nothing pinned yet.</li>}
      </ol>
      <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-zinc-400 uppercase">Your public tracks and collections</h2>
      <ScrollPanel className="max-h-72"><ul className="space-y-1" aria-label="Your public tracks and collections">
        {all.map((p) => (
          <li key={`${p.kind}${p.id}`} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/70">
            <span className="truncate text-sm">{p.title} <span className="text-xs text-zinc-400">{p.kind === "track" ? "Track" : "Collection"}</span></span>
            <Button size="sm" variant="outline" disabled={has(p)} onClick={() => add(p)} aria-label={`Add ${p.title}`}>{has(p) ? "Added" : "Add"}</Button>
          </li>
        ))}
        {all.length === 0 && <li className="text-sm text-zinc-400">Publish something first.</li>}
      </ul></ScrollPanel>
      <Button className="mt-5 bg-orange-700 text-white hover:bg-orange-800" disabled={!draft || save.isPending} onClick={() => draft && save.mutate({ items: draft.map(({ kind, id }) => ({ kind, id })) })}>Save spotlight</Button>
      <UpsellDialog open={upsell} onClose={() => setUpsell(false)} feature="More than one Spotlight item" />
    </div>
  );
}
