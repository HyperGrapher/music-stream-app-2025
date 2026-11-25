"use client";

import { memo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Repeat2,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { useTrackWaveform } from "@/hooks/useTrackWaveform";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack as Track } from "@/types/player-track";
import WaveformVisualizer from "./WaveformVisualizer";

interface WaveformTrackItemProps {
  track: Track & {
    user?: { name: string; image?: string | null };
  };
  compact?: boolean;
  playlist?: Track[];
}

const actionClass =
  "inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white";

export const WaveformTrackItem = memo(function WaveformTrackItem({
  track,
  compact = false,
  playlist,
}: WaveformTrackItemProps) {
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
    togglePlay,
    playTrack,
    setPlaylist,
    seek,
  } = usePlayerStore(useShallow(
    (state) => ({
      isCurrentTrack: state.currentTrack?.id === track.id,
      isPlaying:
        state.currentTrack?.id === track.id && state.status === "playing",
      togglePlay: state.togglePlay,
      playTrack: state.playTrack,
      setPlaylist: state.setPlaylist,
      seek: state.seek,
    })));

  const playFromQueue = useCallback(() => {
    setPlaylist(playlist?.length ? playlist : [track]);
    playTrack(track);
  }, [playlist, playTrack, setPlaylist, track]);

  const handlePlayPause = useCallback(() => {
    if (isCurrentTrack) {
      setPlaylist(playlist?.length ? playlist : [track]);
      togglePlay();
    } else {
      playFromQueue();
    }
  }, [isCurrentTrack, playFromQueue, playlist, setPlaylist, togglePlay, track]);

  const handleSeek = useCallback(
    (position: number) => {
      if (!isCurrentTrack) playFromQueue();
      seek(position);
    },
    [isCurrentTrack, playFromQueue, seek],
  );

  const artistName = track.user?.name ?? "Unknown artist";
  const artworkSize = compact ? "h-28 w-28" : "h-32 w-32 lg:h-40 lg:w-40";

  return (
    <article className="group border-b border-zinc-800/80 py-5 first:pt-0">
      <div className="flex gap-4 lg:gap-5">
        <Link
          href={`/track/${track.id}`}
          className={`${artworkSize} relative shrink-0 overflow-hidden rounded-sm bg-zinc-900`}
        >
          <img
            src={track.artworkUrl ?? "/placeholder-track.jpg"}
            alt={`${track.title} artwork`}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={handlePlayPause}
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 hover:bg-orange-500 hover:text-white"
              aria-label={
                isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
              }
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <Link
                href={track.userId ? `/u/${track.userId}` : "#"}
                className="block truncate text-sm font-medium text-zinc-500 transition hover:text-zinc-300"
              >
                {artistName}
              </Link>
              <Link
                href={`/track/${track.id}`}
                className="block truncate text-base font-semibold text-zinc-100 transition hover:text-orange-500"
              >
                {track.title}
              </Link>
            </div>

            <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
              {track.createdAt && (
                <time className="text-xs text-zinc-500">
                  {formatDistanceToNow(new Date(track.createdAt), {
                    addSuffix: true,
                  })}
                </time>
              )}
              {track.genre && (
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  # {track.genre}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3">
            <WaveformVisualizer
              waveformData={peaks}
              duration={track.duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              height={compact ? 58 : 72}
              variant="list"
              isLoading={isLoading}
            />
            {error && (
              <p className="mt-1 text-[11px] text-red-400">
                Waveform unavailable
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className={actionClass}
              aria-label="Like track"
            >
              <Heart className="h-3.5 w-3.5" /> {track.likeCount ?? 0}
            </button>
            <button
              type="button"
              className={actionClass}
              aria-label="Repost track"
            >
              <Repeat2 className="h-3.5 w-3.5" /> {track.repostCount ?? 0}
            </button>
            <button
              type="button"
              className={actionClass}
              aria-label="Share track"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={actionClass}
              aria-label="Copy track link"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={actionClass}
              aria-label="More options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            <div className="ml-auto hidden items-center gap-3 text-xs text-zinc-500 md:flex">
              <span className="inline-flex items-center gap-1">
                <Play className="h-3 w-3 fill-current" /> {track.playCount ?? 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> {track.commentCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});

export default WaveformTrackItem;
