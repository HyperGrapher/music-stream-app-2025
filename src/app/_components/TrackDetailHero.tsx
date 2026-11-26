"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

import { useTrackWaveform } from "@/hooks/useTrackWaveform";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";
import { CommentMarkers } from "./CommentMarkers";
import { LikeButton } from "./LikeButton";
import WaveformVisualizer from "./WaveformVisualizer";
import { ARTWORK_SIZES } from "@/lib/artwork";
import { genreLabel } from "@/lib/genres";

const roundActionClass =
  "flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-black/50 text-zinc-300 backdrop-blur transition hover:border-zinc-400 hover:text-white";

export function TrackDetailHero({ track, editHref }: { track: PlayerTrack & { likedByMe?: boolean }; editHref?: string }) {
  const { peaks, isLoading, error } = useTrackWaveform(
    track.waveformUrl,
    track.waveformStatus === "FAILED",
  );
  const currentTime = usePlayerStore((state) =>
    state.currentTrack?.id === track.id ? state.currentTime : 0,
  );
  const {
    isCurrentTrack,
    isPlaying,
    playTrack,
    setPlaylist,
    togglePlay,
    seek,
  } = usePlayerStore(useShallow(
    (state) => ({
      isCurrentTrack: state.currentTrack?.id === track.id,
      isPlaying:
        state.currentTrack?.id === track.id && state.status === "playing",
      playTrack: state.playTrack,
      setPlaylist: state.setPlaylist,
      togglePlay: state.togglePlay,
      seek: state.seek,
    })));

  const startTrack = useCallback(() => {
    setPlaylist([track]);
    playTrack(track);
  }, [playTrack, setPlaylist, track]);
  const handlePlayPause = useCallback(() => {
    if (isCurrentTrack) togglePlay();
    else startTrack();
  }, [isCurrentTrack, startTrack, togglePlay]);
  const handleSeek = useCallback(
    (position: number) => {
      if (!isCurrentTrack) startTrack();
      seek(position);
    },
    [isCurrentTrack, seek, startTrack],
  );

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
      {track.artworkUrl && (
        <img
          src={track.artworkUrl}
          srcSet={track.artworkSrcSet ?? undefined}
          sizes={ARTWORK_SIZES.backdrop}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-3xl"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/95 to-black/60" />

      <div className="relative grid min-h-[380px] gap-8 p-6 md:grid-cols-[minmax(0,1fr)_320px] lg:p-8">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={handlePlayPause}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-black/70 text-white transition hover:scale-105 hover:border-orange-500 hover:text-orange-500"
              aria-label={
                isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
              }
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="ml-1 h-7 w-7 fill-current" />
              )}
            </button>
            <div className="min-w-0 pt-0.5">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {track.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <Link
                  href={track.user?.username ? `/${track.user.username}` : "#"}
                  className="transition hover:text-orange-500"
                >
                  {track.user?.name ?? "Unknown artist"}
                </Link>
                {track.genre && (
                  <>
                    <span>·</span>
                    <span>{genreLabel(track.genre)}</span>
                  </>
                )}
                {track.createdAt && (
                  <>
                    <span>·</span>
                    <span>
                      {formatDistanceToNow(new Date(track.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-10">
            <WaveformVisualizer
              waveformData={peaks}
              duration={track.duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              height={142}
              variant="detail"
              isLoading={isLoading}
            />
            <CommentMarkers track={track} />
            {error && (
              <p className="mt-2 text-xs text-red-400">Waveform unavailable</p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <LikeButton
              trackId={track.id}
              creatorId={track.userId}
              access={track.accessQuery}
              isPrivate={track.isPrivate}
              initialLiked={track.likedByMe}
              initialCount={track.likeCount ?? 0}
              variant="round"
              className={roundActionClass}
            />
            {editHref && (
              <Link href={editHref} className={roundActionClass} aria-label="Edit track">
                <Pencil className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              className={roundActionClass}
              aria-label="Share track"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={roundActionClass}
              aria-label="Copy track link"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={roundActionClass}
              aria-label="Repost track"
            >
              <Repeat2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={roundActionClass}
              aria-label="Add to playlist"
            >
              <Plus className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={roundActionClass}
              aria-label="More track actions"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>

        <Link
          href={track.artworkUrl ?? "#"}
          className="relative order-first aspect-square w-full self-center overflow-hidden rounded-lg bg-zinc-900 shadow-2xl md:order-last"
        >
          <img
            src={track.artworkUrl ?? "/placeholder-track.jpg"}
            srcSet={track.artworkSrcSet ?? undefined}
            sizes={ARTWORK_SIZES.hero}
            alt={`${track.title} artwork`}
            className="h-full w-full object-cover"
          />
        </Link>
      </div>
    </section>
  );
}
