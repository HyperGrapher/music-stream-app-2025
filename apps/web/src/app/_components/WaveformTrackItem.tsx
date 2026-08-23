"use client";

import { useCallback, useMemo, memo } from "react";
import {
  Heart,
  MessageCircle,
  Share,
  MoreHorizontal,
  Pause,
  Play,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import WaveformVisualizer from "./WaveformVisualizer";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack as Track } from "@/types/player-track";
import { formatDuration } from "@/lib/utils";
import { shallow } from "zustand/shallow";

interface WaveformTrackItemProps {
  track: Track & {
    user?: {
      name: string;
      image?: string | null;
    };
  };
  waveformData?: number[];
  compact?: boolean;
  /** Queue to use for Next/Previous when this item starts playback. */
  playlist?: Track[];
}

const createFallbackWaveform = () =>
  Array.from({ length: 100 }, () => Math.random());

const parseWaveform = (waveform: string): number[] => {
  const parsed: unknown = JSON.parse(waveform);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
};

// Memoized track cover and play button component
const TrackCover = memo(function TrackCover({
  track,
  isPlaying,
  handlePlayPause,
}: {
  track: Track;
  isPlaying: boolean;
  handlePlayPause: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative h-16 w-16 min-w-16 overflow-hidden rounded md:h-20 md:w-20 md:min-w-20">
      <img
        src={track.artworkUrl ?? "/placeholder-track.jpg"}
        alt={track.title}
        className="object-cover"
      />
      <button
        onClick={handlePlayPause}
        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500">
          {isPlaying ? (
            <Pause className="h-5 w-5 text-white" />
          ) : (
            <Play className="ml-1 h-5 w-5 text-white" />
          )}
        </div>
      </button>
    </div>
  );
});
// Memoized track info component
const TrackInfo = memo(function TrackInfo({
  track,
}: {
  track: WaveformTrackItemProps["track"];
}) {
  return (
    <div className="mb-1 flex items-center">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
        <div className="text-xs text-gray-400">
          {track.user?.name ?? "Unknown Artist"}
        </div>
        <h3 className="truncate text-sm font-medium text-white md:text-base">
          {track.title}
        </h3>
      </div>
      <div className="ml-auto text-xs text-gray-500">
        {formatDistanceToNow(new Date(track.createdAt), { addSuffix: true })}
      </div>
    </div>
  );
});

// Memoized waveform component that will only update for the current track
function TrackWaveform({
  track,
  parsedWaveformData,
  compact,
  handleSeek,
}: {
  track: Track;
  parsedWaveformData: number[];
  compact: boolean;
  handleSeek: (position: number) => void;
}) {
  // Only subscribe to currentTime if this is the current track
  const currentTime = usePlayerStore((state) =>
    state.currentTrack?.id === track.id ? state.currentTime : 0,
  );

  return (
    <div className="relative mt-2 h-12 md:h-16">
      <WaveformVisualizer
        waveformData={parsedWaveformData}
        duration={track.duration}
        currentTime={currentTime}
        onSeek={handleSeek}
        height={compact ? 32 : 52}
        color="#999999"
        progressColor="#f50"
        backgroundColor="transparent"
      />
      {track.genre && (
        <div className="absolute top-0 right-0 rounded bg-zinc-800 px-2 py-1 text-xs text-white">
          {track.genre}
        </div>
      )}
      <div className="absolute right-0 bottom-0 text-xs text-gray-400">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
}

// Memoized action buttons component
const ActionButtons = memo(function ActionButtons({ track }: { track: Track }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white"
        title="Like"
      >
        <Heart className="h-4 w-4" />
      </Button>
      <span className="text-xs text-gray-500">{track.likeCount}</span>

      <Button
        variant="ghost"
        size="icon"
        className="ml-2 h-8 w-8 text-gray-400 hover:text-white"
        title="Comment"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>
      <span className="text-xs text-gray-500">{track.commentCount}</span>

      <Button
        variant="ghost"
        size="icon"
        className="ml-2 h-8 w-8 text-gray-400 hover:text-white"
        title="Share"
      >
        <Share className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto h-8 w-8 text-gray-400 hover:text-white"
        title="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
});

// Main component that manages the state and combines the memoized subcomponents
export const WaveformTrackItem = memo(function WaveformTrackItem({
  track,
  waveformData = [],
  compact = false,
  playlist,
}: WaveformTrackItemProps) {
  // Parse waveform data from track if provided as string
  const parsedWaveformData = useMemo(() => {
    if (waveformData.length > 0) return waveformData;
    if (track.waveformData) {
      try {
        const parsedWaveform = parseWaveform(track.waveformData);
        return parsedWaveform.length > 0
          ? parsedWaveform
          : createFallbackWaveform();
      } catch (e) {
        console.error("Error parsing waveform data:", e);
        return createFallbackWaveform();
      }
    }
    return createFallbackWaveform();
  }, [track.waveformData, waveformData]);

  // Only subscribe to the minimal state needed for this component
  const {
    isCurrentTrack,
    isPlaying,
    togglePlay,
    playTrack,
    setPlaylist,
    seek,
  } = usePlayerStore(
    (state) => ({
      isCurrentTrack: state.currentTrack?.id === track.id,
      isPlaying:
        state.currentTrack?.id === track.id && state.status === "playing",
      togglePlay: state.togglePlay,
      playTrack: state.playTrack,
      setPlaylist: state.setPlaylist,
      seek: state.seek,
    }),
    shallow,
  );

  const playFromQueue = useCallback(() => {
    setPlaylist(playlist?.length ? playlist : [track]);
    playTrack(track);
  }, [playlist, playTrack, setPlaylist, track]);

  // Handle play/pause
  const handlePlayPause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isCurrentTrack) {
        setPlaylist(playlist?.length ? playlist : [track]);
        togglePlay();
      } else {
        playFromQueue();
      }
    },
    [isCurrentTrack, playFromQueue, playlist, setPlaylist, togglePlay, track],
  );

  // Handle seek on waveform
  const handleSeek = useCallback(
    (position: number) => {
      if (isCurrentTrack) {
        seek(position);
      } else {
        playFromQueue();
        seek(position);
      }
    },
    [isCurrentTrack, playFromQueue, seek, track],
  );

  return (
    <div className="group mb-4 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex gap-3">
        {/* Cover Art & Play Button Section */}
        <TrackCover
          track={track}
          isPlaying={isPlaying}
          handlePlayPause={handlePlayPause}
        />

        {/* Track Info Section */}
        <div className="flex-1 overflow-hidden">
          <TrackInfo track={track} />

          {/* Waveform Section */}
          <TrackWaveform
            track={track}
            parsedWaveformData={parsedWaveformData}
            compact={compact}
            handleSeek={handleSeek}
          />

          {/* Action Buttons */}
          <ActionButtons track={track} />
        </div>
      </div>
    </div>
  );
});

export default WaveformTrackItem;
