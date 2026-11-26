"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { copyText } from "@/components/player/TrackMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

import { UsageBar } from "../UsageBar";

const TYPE = { PLAYLIST: "Playlist", ALBUM: "Album", EP: "EP", SINGLE: "Single", COMPILATION: "Compilation" } as const;

/** `/studio/sets`: your albums and playlists with stats and actions (Edit / Delete / Copy link). */
export function StudioSets() {
  const utils = api.useUtils();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [alsoTracks, setAlsoTracks] = useState(false);
  const list = api.studio.collections.useQuery({ q: search || undefined });
  const del = api.collections.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); setRemoving(null); void utils.studio.collections.invalidate(); },
    onError: (e) => toast.error(friendlyError(e, "Could not delete")),
  });
  return (
    <div>
      <UsageBar />
      <div className="flex items-center gap-2">
        <form role="search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}><Input aria-label="Search your albums and playlists" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-56 border-zinc-700 bg-zinc-900" /></form>
        <Button asChild size="sm" className="ml-auto bg-orange-700 text-white hover:bg-orange-800"><Link href="/upload">Upload</Link></Button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-zinc-900/70 text-left text-xs text-zinc-400"><tr><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Privacy</th><th className="p-3 text-right">Tracks</th><th className="p-3 text-right">Likes</th><th className="p-3 text-right">Reposts</th><th className="p-3 text-right">Plays</th><th className="p-3 text-right">Date</th><th className="p-3" /></tr></thead>
          <tbody>
            {(list.data?.items ?? []).map((c) => (
              <tr key={c.id} className="border-t border-zinc-800" data-testid="studio-set-row">
                <td className="p-3"><div className="flex items-center gap-3"><img src={c.artworkUrl ?? "/placeholder-track.jpg"} alt="" className="h-10 w-10 rounded object-cover" /><Link href={c.permalink} className="font-semibold hover:text-orange-400">{c.title}</Link></div></td>
                <td className="p-3">{TYPE[c.type]}</td>
                <td className="p-3">{c.visibility === "PUBLIC" ? "Public" : "Private"}</td>
                <td className="p-3 text-right tabular-nums">{c.trackCount}</td>
                <td className="p-3 text-right tabular-nums">{c.likeCount}</td>
                <td className="p-3 text-right tabular-nums">{c.repostCount}</td>
                <td className="p-3 text-right tabular-nums">{c.playCount}</td>
                <td className="p-3 text-right text-zinc-400">{formatDistanceToNowStrict(new Date(c.releaseDate ?? c.createdAt), { addSuffix: true })}</td>
                <td className="space-x-2 p-3 text-right whitespace-nowrap">
                  <Link href={`/studio/sets/${c.id}/edit`} className="text-orange-400 hover:underline">Edit</Link>
                  <button className="text-zinc-300 hover:text-white" onClick={() => copyText(new URL(c.visibility === "PUBLIC" ? c.permalink : `${c.permalink}/s-${c.secretToken}`, window.location.origin).toString(), c.visibility === "PUBLIC" ? "Link copied" : "Secret link copied")}>Copy link</button>
                  <button className="text-red-400 hover:text-red-300" onClick={() => setRemoving({ id: c.id, title: c.title })}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.isLoading && (list.data?.items.length ?? 0) === 0 && <p className="p-8 text-center text-sm text-zinc-400">Nothing here yet.</p>}
      </div>
      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Delete “{removing?.title}”?</DialogTitle><DialogDescription className="text-zinc-400">The tracks stay as standalone tracks unless you also delete them.</DialogDescription></DialogHeader>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alsoTracks} onChange={(e) => setAlsoTracks(e.target.checked)} /> Also delete my tracks in it</label>
          <Button variant="destructive" disabled={del.isPending} onClick={() => removing && del.mutate({ id: removing.id, deleteTracks: alsoTracks })}>Delete</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
