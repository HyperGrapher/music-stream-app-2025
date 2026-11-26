"use client";

import { ListMusic, Pause, Play } from "lucide-react";
import Link from "next/link";

import { usePlayerStore } from "@/store/player";
import type { RouterOutputs } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

type Card = RouterOutputs["messages"]["thread"]["messages"][number]["cards"][number];

/** A track or collection link inside a message, as a small card (MS-2): artwork, title, creator, and a play button for tracks. */
export function MessageCard({ card }: { card: Card }) {
  const current = usePlayerStore((s) => s.currentTrack);
  const playing = usePlayerStore((s) => s.status === "playing");

  if (card.kind === "set") {
    const { set } = card;
    return (
      <Link href={set.permalink} className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-2 hover:border-zinc-500">
        { }
        {set.artworkUrl ? <img src={set.artworkUrl} alt="" className="h-12 w-12 rounded object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded bg-zinc-800"><ListMusic className="h-5 w-5 text-zinc-400" /></span>}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{set.title}</span>
          <span className="block truncate text-xs text-zinc-400">{set.isPlaylist ? "Playlist" : "Album"} by {set.owner.name} · {set.trackCount} {set.trackCount === 1 ? "track" : "tracks"}</span>
        </span>
      </Link>
    );
  }

  const track = card.track as PlayerTrack;
  const isCurrent = current?.id === track.id;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-2">
      <button
        type="button"
        aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        onClick={() => (isCurrent ? usePlayerStore.getState().togglePlay() : usePlayerStore.getState().playContext([track], track, { name: "Messages", source: "OTHER" }))}
        className="group relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800"
      >
        { }
        {track.artworkUrl ? <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white group-hover:bg-black/60">{isCurrent && playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</span>
      </button>
      <Link href={track.permalink ?? "#"} className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white hover:underline">{track.title}</span>
        <span className="block truncate text-xs text-zinc-400">{track.artistName ?? track.user?.name}</span>
      </Link>
    </div>
  );
}
