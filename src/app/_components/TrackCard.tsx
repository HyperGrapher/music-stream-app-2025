"use client";

import { memo, useCallback } from "react";
import { Headphones, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { genreLabel } from "@/lib/genres";
import { formatCount, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";
import { ARTWORK_SIZES } from "@/lib/artwork";

type CardTrack = PlayerTrack & { user?: { name: string; image?: string | null } };

interface TrackCardProps {
  track: CardTrack;
  /** The list this card belongs to: becomes the player queue when a card is played. */
  playlist: CardTrack[];
}

export const TrackCard = memo(function TrackCard({ track, playlist }: TrackCardProps) {
  const { isCurrentTrack, isPlaying, playTrack, setPlaylist, togglePlay } =
    usePlayerStore(
      useShallow((state) => ({
        isCurrentTrack: state.currentTrack?.id === track.id,
        isPlaying: state.currentTrack?.id === track.id && state.status === "playing",
        playTrack: state.playTrack,
        setPlaylist: state.setPlaylist,
        togglePlay: state.togglePlay,
      })),
    );

  const handlePlay = useCallback(() => {
    setPlaylist(playlist);
    if (isCurrentTrack) togglePlay();
    else playTrack(track);
  }, [isCurrentTrack, playTrack, playlist, setPlaylist, togglePlay, track]);

  return (
    <article className="group min-w-0">
      <div className="relative aspect-square overflow-hidden rounded-md bg-zinc-900">
        <Link href={`/track/${track.id}`} className="block h-full w-full" tabIndex={-1}>
          <img
            src={track.artworkUrl ?? "/placeholder-track.jpg"}
            srcSet={track.artworkSrcSet ?? undefined}
            sizes={ARTWORK_SIZES.card}
            alt={`${track.title} artwork`}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </Link>
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent transition-opacity ${
            isCurrentTrack ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        />
        <button
          type="button"
          onClick={handlePlay}
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className={`absolute right-3 bottom-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:scale-105 hover:bg-orange-400 focus-visible:opacity-100 ${
            isCurrentTrack ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          )}
        </button>
        {track.duration > 0 && (
          <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-zinc-200">
            {formatDuration(track.duration)}
          </span>
        )}
      </div>

      <div className="mt-2.5 min-w-0">
        <Link
          href={`/track/${track.id}`}
          className="block truncate text-sm font-semibold text-white hover:text-orange-400"
          title={track.title}
        >
          {track.title}
        </Link>
        {track.userId && track.user && (
          <Link
            href={`/u/${track.userId}`}
            className="block truncate text-sm text-zinc-400 hover:text-white"
          >
            {track.user.name}
          </Link>
        )}
        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Headphones className="h-3.5 w-3.5" />
            {formatCount(track.playCount ?? 0)}
          </span>
          {track.genre && <span className="truncate">{genreLabel(track.genre)}</span>}
        </div>
      </div>
    </article>
  );
});
