"use client";

import { memo, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  MessageCircle,
  Pause,
  Play,
  Link2,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { useTrackWaveform } from "@/hooks/useTrackWaveform";
import { usePlayerStore, type ContextMeta } from "@/store/player";
import { useDialogs } from "@/store/dialogs";
import { TrackMenu, copyText, absoluteUrl } from "@/components/player/TrackMenu";
import type { PlayerTrack as Track } from "@/types/player-track";
import { LikeButton } from "./LikeButton";
import { RepostButton } from "./RepostButton";
import WaveformVisualizer from "./WaveformVisualizer";
import { ARTWORK_SIZES } from "@/lib/artwork";
import { genreLabel } from "@/lib/genres";

interface WaveformTrackItemProps {
  track: Track & {
    user?: { name: string; username?: string; image?: string | null };
  };
  compact?: boolean;
  playlist?: Track[];
  /** Where the list comes from: names the queue and credits plays (collection page, profile, ...). */
  context?: ContextMeta;
}

/** Animated bars next to the title of the track that is playing. */
function Equaliser() {
  return (
    <span className="mr-2 inline-flex h-3 items-end gap-0.5 align-baseline" aria-label="Playing" role="img">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="w-0.5 animate-pulse bg-orange-700" style={{ height: `${60 + delay / 5}%`, animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

const actionClass =
  "inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white";

export const WaveformTrackItem = memo(function WaveformTrackItem({
  track,
  compact = false,
  playlist,
  context,
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
    playContext,
    seek,
  } = usePlayerStore(useShallow(
    (state) => ({
      isCurrentTrack: state.currentTrack?.id === track.id,
      isPlaying:
        state.currentTrack?.id === track.id && state.status === "playing",
      togglePlay: state.togglePlay,
      playContext: state.playContext,
      seek: state.seek,
    })));

  const playFromQueue = useCallback(() => {
    playContext(playlist?.length ? playlist : [track], track, context);
  }, [context, playContext, playlist, track]);

  const handlePlayPause = useCallback(() => {
    if (isCurrentTrack) togglePlay();
    else playFromQueue();
  }, [isCurrentTrack, playFromQueue, togglePlay]);

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
          href={track.permalink ?? "#"}
          className={`${artworkSize} relative shrink-0 overflow-hidden rounded-sm bg-zinc-900`}
        >
          <img
            src={track.artworkUrl ?? "/placeholder-track.jpg"}
            srcSet={track.artworkSrcSet ?? undefined}
            sizes={ARTWORK_SIZES.listItem}
            alt={`${track.title} artwork`}
            loading="lazy"
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
                href={track.user?.username ? `/${track.user.username}` : "#"}
                className="block truncate py-0.5 text-sm font-medium text-zinc-400 transition hover:text-zinc-300"
              >
                {artistName}
              </Link>
              <Link
                href={track.permalink ?? "#"}
                className="block truncate text-base font-semibold text-zinc-100 transition hover:text-orange-500"
              >
                {isPlaying ? <Equaliser /> : null}
                {track.title}
              </Link>
            </div>

            <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
              {track.createdAt && (
                <time className="text-xs text-zinc-400">
                  {formatDistanceToNow(new Date(track.createdAt), {
                    addSuffix: true,
                  })}
                </time>
              )}
              {track.genre && (
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                  # {genreLabel(track.genre)}
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

          <div className="mt-3 no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            <LikeButton
              trackId={track.id}
              creatorId={track.userId}
              access={track.accessQuery}
              isPrivate={track.isPrivate}
              initialLiked={track.likedByMe}
              initialCount={track.likeCount ?? 0}
              variant="pill"
              className={actionClass}
            />
            <RepostButton kind="track" id={track.id} ownerId={track.userId} isPrivate={track.isPrivate} initialReposted={track.repostedByMe} initialCount={track.repostCount ?? 0} variant="pill" className={actionClass} />
            <button
              type="button"
              className={actionClass}
              aria-label="Share track"
              onClick={() => track.permalink && useDialogs.getState().openShare({ kind: "track", id: track.id, title: track.title, path: track.permalink, isPrivate: track.isPrivate, embeddable: track.embeddable, secret: new URLSearchParams(track.accessQuery).get("s"), atSeconds: isCurrentTrack ? currentTime : 0 })}
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={actionClass}
              aria-label="Copy track link"
              onClick={() => track.permalink && copyText(absoluteUrl(track.permalink))}
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
            <TrackMenu track={track} className="h-8 w-8 rounded border border-zinc-700 bg-zinc-900" />
            <div className="ml-auto hidden items-center gap-3 text-xs text-zinc-400 md:flex">
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
