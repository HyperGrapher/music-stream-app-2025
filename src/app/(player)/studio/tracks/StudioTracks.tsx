"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { copyText } from "@/components/player/TrackMenu";
import { friendlyError } from "@/lib/error-messages";
import { cn, formatDuration } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";

import { BulkEditDialog } from "../BulkEditDialog";
import { UsageBar } from "../UsageBar";

type Row = RouterOutputs["studio"]["tracks"]["items"][number];
type Sort = "createdAt" | "title" | "durationMs" | "playCount" | "likeCount" | "repostCount" | "commentCount" | "downloadCount";
const FILTERS = [["all", "All"], ["public", "Public"], ["private", "Private"], ["scheduled", "Scheduled"], ["removed", "Removed"]] as const;
const COLUMNS: [Sort, string][] = [["durationMs", "Length"], ["playCount", "Plays"], ["likeCount", "Likes"], ["repostCount", "Reposts"], ["commentCount", "Comments"], ["downloadCount", "Downloads"], ["createdAt", "Date"]];

function Pill({ row }: { row: Row }) {
  if (row.state === "public") return null;
  const text = row.state === "scheduled" ? `Scheduled for ${row.publishAt ? new Date(row.publishAt).toLocaleString() : ""}` : row.state === "removed" ? "Removed" : "Private";
  return <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", row.state === "removed" ? "bg-red-500/20 text-red-300" : "bg-zinc-800 text-zinc-300")}>{text}</span>;
}

function AddToPlaylistBulk({ ids, open, onClose }: { ids: string[]; open: boolean; onClose: () => void }) {
  const mine = api.collections.mine.useQuery(undefined, { enabled: open });
  const [title, setTitle] = useState("");
  const done = () => { toast.success("Added to playlist"); onClose(); };
  const add = api.collections.addTracks.useMutation({ onSuccess: done, onError: (e) => toast.error(friendlyError(e, "Could not add the tracks")) });
  const create = api.collections.createPlaylist.useMutation({ onSuccess: done, onError: (e) => toast.error(friendlyError(e, "Could not create the playlist")) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader><DialogTitle>Add {ids.length} tracks to a playlist</DialogTitle><DialogDescription className="text-zinc-400">Pick a playlist or start a new one.</DialogDescription></DialogHeader>
        <ul className="max-h-52 space-y-1 overflow-y-auto">
          {(mine.data ?? []).map((p) => <li key={p.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-zinc-900"><span className="truncate text-sm">{p.title}</span><Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate({ id: p.id, trackIds: ids })}>Add</Button></li>)}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ title, trackIds: ids }); }}>
          <Input aria-label="New playlist title" placeholder="New playlist title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className="border-zinc-700 bg-zinc-900" />
          <Button type="submit" disabled={!title.trim() || create.isPending}>Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ ids, open, onClose, onDone }: { ids: string[]; open: boolean; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const needsTyping = ids.length > 5;
  const del = api.studio.bulkDelete.useMutation({
    onSuccess: (r) => { toast.success(`Deleted ${r.deleted} ${r.deleted === 1 ? "track" : "tracks"}`); setTyped(""); onDone(); },
    onError: (e) => toast.error(friendlyError(e, "Could not delete the tracks")),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {ids.length} {ids.length === 1 ? "track" : "tracks"}?</DialogTitle>
          <DialogDescription className="text-zinc-400">Their likes, comments, plays and links are removed for good. Playlists and albums just lose them. This cannot be undone.</DialogDescription>
        </DialogHeader>
        {needsTyping && <Input aria-label="Type DELETE to confirm" placeholder="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className="border-zinc-700 bg-zinc-900" />}
        <Button variant="destructive" disabled={del.isPending || (needsTyping && typed !== "DELETE")} onClick={() => del.mutate({ ids, confirmation: typed || undefined })}>Delete</Button>
      </DialogContent>
    </Dialog>
  );
}

/** `/studio/tracks` (ST-1..ST-3): table of all your tracks with sort, filter, search, row menu and bulk actions. */
export function StudioTracks() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<(typeof FILTERS)[number][0]>("all");
  const [sort, setSort] = useState<Sort>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [more, setMore] = useState<Row[]>([]);
  const [offset, setOffset] = useState<number | null | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"edit" | "playlist" | "delete" | null>(null);
  const usage = api.studio.usage.useQuery();
  const utils = api.useUtils();
  const list = api.studio.tracks.useQuery({ q: search || undefined, visibility, sort, dir });
  const rows = [...(list.data?.items ?? []), ...more];
  const next = offset === undefined ? (list.data?.nextOffset ?? null) : offset;
  const ids = [...selected];
  const reset = () => { setMore([]); setOffset(undefined); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div>
      <UsageBar />
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([value, label]) => <button key={value} aria-pressed={visibility === value} onClick={() => { setVisibility(value); reset(); }} className={cn("rounded-full border px-3 py-1 text-sm", visibility === value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>{label}</button>)}
        <form className="ml-auto" role="search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); reset(); }}>
          <Input aria-label="Search your tracks" placeholder="Search your tracks" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56 border-zinc-700 bg-zinc-900" />
        </form>
        <Button asChild size="sm" className="bg-orange-500 text-white hover:bg-orange-600"><Link href="/upload">Upload</Link></Button>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-orange-500/40 bg-zinc-950 p-3 shadow-lg" role="toolbar" aria-label="Bulk actions">
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("playlist")}>Add to playlist</Button>
          <Button size="sm" variant="destructive" onClick={() => setDialog("delete")}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-900/70 text-left text-xs text-zinc-400">
            <tr>
              <th className="w-10 p-3"><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="p-3"><button onClick={() => { setSort("title"); setDir(sort === "title" && dir === "asc" ? "desc" : "asc"); reset(); }} className="font-medium">Track</button></th>
              <th className="p-3">In</th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="p-3 text-right"><button onClick={() => { setSort(key); setDir(sort === key && dir === "desc" ? "asc" : "desc"); reset(); }} className="inline-flex items-center gap-1 font-medium" aria-label={`Sort by ${label}`}>{label}{sort === key ? (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : null}</button></th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-800 hover:bg-zinc-900/40" data-testid="studio-row">
                <td className="p-3"><input type="checkbox" aria-label={`Select ${row.title}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <img src={row.artworkUrl ?? "/placeholder-track.jpg"} alt="" className="h-10 w-10 rounded object-cover" />
                    <div className="min-w-0"><Link href={row.permalink} className="font-semibold hover:text-orange-400">{row.title}</Link><Pill row={row} /></div>
                  </div>
                </td>
                <td className="max-w-40 truncate p-3 text-zinc-400">{row.collections.map((c) => c.title).join(", ") || "—"}</td>
                <td className="p-3 text-right tabular-nums">{formatDuration(Math.round(row.durationMs / 1000))}</td>
                <td className="p-3 text-right tabular-nums">{row.playCount}</td>
                <td className="p-3 text-right tabular-nums">{row.likeCount}</td>
                <td className="p-3 text-right tabular-nums">{row.repostCount}</td>
                <td className="p-3 text-right tabular-nums">{row.commentCount}</td>
                <td className="p-3 text-right tabular-nums">{row.downloadCount}</td>
                <td className="p-3 text-right text-zinc-400">{formatDistanceToNowStrict(new Date(row.publishedAt ?? row.createdAt), { addSuffix: true })}</td>
                <td className="p-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button aria-label={`Actions for ${row.title}`} className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link href={`/studio/tracks/${row.id}/edit`}>Edit</Link></DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => copyText(new URL(row.permalink, window.location.origin).toString())}>Copy link</DropdownMenuItem>
                      {row.state !== "public" && <DropdownMenuItem onSelect={() => copyText(new URL(`${row.permalink}/s-${row.secretToken}`, window.location.origin).toString(), "Secret link copied")}>Copy secret link</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => { setSelected(new Set([row.id])); setDialog("playlist"); }}>Add to playlist</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-400" onSelect={() => { setSelected(new Set([row.id])); setDialog("delete"); }}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading && <p className="p-6 text-sm text-zinc-400">Loading…</p>}
        {!list.isLoading && rows.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">{search || visibility !== "all" ? "No tracks match." : "You have not uploaded anything yet."}</p>}
      </div>
      <p className="mt-2 text-xs text-zinc-500">{list.data?.total ?? 0} {list.data?.total === 1 ? "track" : "tracks"}</p>
      {next !== null && <div className="mt-4 text-center"><Button variant="outline" className="border-zinc-700 bg-transparent text-white" onClick={async () => { const page = await utils.studio.tracks.fetch({ q: search || undefined, visibility, sort, dir, offset: next }); setMore((m) => [...m, ...page.items]); setOffset(page.nextOffset); }}>Load more</Button></div>}

      <BulkEditDialog ids={ids} plan={usage.data?.plan ?? "FREE"} open={dialog === "edit"} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reset(); }} />
      <AddToPlaylistBulk ids={ids} open={dialog === "playlist"} onClose={() => setDialog(null)} />
      <DeleteDialog ids={ids} open={dialog === "delete"} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void utils.studio.tracks.invalidate(); void utils.studio.usage.invalidate(); reset(); }} />
    </div>
  );
}
