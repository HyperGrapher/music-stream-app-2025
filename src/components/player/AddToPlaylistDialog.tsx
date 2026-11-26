"use client";

import { Check, Lock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollPanel } from "@/components/ui/scroll-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { friendlyError } from "@/lib/error-messages";
import { useDialogs } from "@/store/dialogs";
import { api } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

function Body({ track, close }: { track: PlayerTrack; close: () => void }) {
  const utils = api.useUtils();
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const playlists = api.collections.mine.useQuery({ trackId: track.id });
  const refresh = () => void utils.collections.mine.invalidate();
  const onError = (error: Parameters<typeof friendlyError>[0]) => toast.error(friendlyError(error, "Could not update the playlist"));
  const add = api.collections.addTracks.useMutation({ onSuccess: () => { refresh(); toast.success("Added to playlist"); }, onError });
  const remove = api.collections.removeTrack.useMutation({ onSuccess: () => { refresh(); toast.success("Removed from playlist"); }, onError });
  const create = api.collections.createPlaylist.useMutation({ onSuccess: (playlist) => { refresh(); toast.success(`Created “${playlist.title}”`); close(); }, onError });
  const shown = (playlists.data ?? []).filter((p) => p.title.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <Tabs defaultValue="add" className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="add">Add to playlist</TabsTrigger>
        <TabsTrigger value="create">Create a playlist</TabsTrigger>
      </TabsList>
      {/* Both tabs share one fixed-height pane, so the dialog never resizes; a long playlist list scrolls inside it. */}
      <TabsContent value="add" className="flex h-72 flex-none flex-col gap-3">
        <Input placeholder="Filter playlists" aria-label="Filter playlists" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ScrollPanel className="flex-1"><ul className="space-y-1" aria-label="Your playlists">
          {playlists.isLoading ? <li className="px-2 py-1.5 text-sm text-zinc-400">Loading…</li> : null}
          {!playlists.isLoading && shown.length === 0 ? <li className="px-2 py-1.5 text-sm text-zinc-400">{filter.trim() ? "No playlist matches that." : "No playlists yet. Create one in the other tab."}</li> : null}
          {shown.map((playlist) => (
            <li key={playlist.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800">
              <span className="min-w-0 flex-1 truncate text-sm">{playlist.title}{playlist.visibility === "PRIVATE" ? <Lock className="ml-1 inline h-3 w-3 text-zinc-400" aria-label="Private" /> : null}</span>
              <span className="text-xs text-zinc-400">{playlist.trackCount}</span>
              <Button
                size="sm"
                variant={playlist.hasTrack ? "secondary" : "outline"}
                disabled={add.isPending || remove.isPending}
                aria-label={playlist.hasTrack ? `Remove from ${playlist.title}` : `Add to ${playlist.title}`}
                onClick={() => (playlist.hasTrack ? remove.mutate({ id: playlist.id, trackId: track.id }) : add.mutate({ id: playlist.id, trackIds: [track.id] }))}
              >
                {playlist.hasTrack ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
              </Button>
            </li>
          ))}
        </ul></ScrollPanel>
      </TabsContent>
      <TabsContent value="create" className="h-72 flex-none">
        <form
          className="flex h-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate({ title, privacy: isPublic ? "public" : "private", trackIds: [track.id] });
          }}
        >
          <Input placeholder="Playlist title" aria-label="Playlist title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> Public (anyone can find it)
          </label>
          <Button type="submit" className="mt-auto" disabled={!title.trim() || create.isPending}>Create playlist</Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

export function AddToPlaylistDialog() {
  const track = useDialogs((s) => s.addToPlaylist);
  const close = useDialogs((s) => s.close);
  return (
    <Dialog open={!!track} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription className="truncate">{track?.title}</DialogDescription>
        </DialogHeader>
        {track ? <Body key={track.id} track={track} close={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}
