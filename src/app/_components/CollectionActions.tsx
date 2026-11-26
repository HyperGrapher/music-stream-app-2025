"use client";

import { useShallow } from "zustand/react/shallow";
import { Link2, Pause, Play, Share2, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { absoluteUrl, copyText } from "@/components/player/TrackMenu";
import { useDialogs } from "@/store/dialogs";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

/** Play / Shuffle / Share row of a collection page (PRD 8.4). */
export function CollectionActions({
  collection,
  tracks,
}: {
  collection: { id: string; title: string; permalink: string; visibility: string; viaSecret: boolean; secretToken: string | null };
  tracks: PlayerTrack[];
}) {
  const { playContext, toggleShuffle, togglePlay, status, contextCollectionId, shuffle } = usePlayerStore(useShallow((s) => ({
    playContext: s.playContext,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    status: s.status,
    contextCollectionId: s.contextCollectionId,
    shuffle: s.shuffle,
  })));
  const meta = { name: collection.title, source: "COLLECTION" as const, collectionId: collection.id };
  const isCurrent = contextCollectionId === collection.id && status !== "idle";
  const playing = isCurrent && status === "playing";
  const isPrivate = collection.visibility !== "PUBLIC";
  const secret = /\/s-([^/]+)$/.exec(collection.permalink)?.[1] ?? collection.secretToken;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button type="button" disabled={tracks.length === 0} onClick={() => (isCurrent ? togglePlay() : tracks[0] && playContext(tracks, tracks[0], meta))} className="rounded-full bg-orange-500 px-5 text-white hover:bg-orange-400">
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />} {playing ? "Pause" : "Play"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={tracks.length === 0}
        className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
        onClick={() => {
          const first = tracks[Math.floor(Math.random() * tracks.length)];
          if (!first) return;
          playContext(tracks, first, meta);
          if (!shuffle) toggleShuffle();
        }}
      >
        <Shuffle className="h-4 w-4" /> Shuffle
      </Button>
      <Button type="button" variant="outline" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => useDialogs.getState().openShare({ kind: "set", id: collection.id, title: collection.title, path: collection.permalink, isPrivate, secret: isPrivate ? secret : null })}>
        <Share2 className="h-4 w-4" /> Share
      </Button>
      <Button type="button" variant="outline" size="icon" aria-label="Copy link" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => copyText(absoluteUrl(collection.permalink))}>
        <Link2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
