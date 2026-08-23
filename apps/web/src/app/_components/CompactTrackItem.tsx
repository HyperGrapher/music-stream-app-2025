"use client";

import { useCallback } from "react";
import Image from "next/image";
import { Pause, Play, Heart } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack as Track } from "@/types/player-track";
import { formatDuration } from "@/lib/utils";

interface CompactTrackItemProps {
  track: Track & {
    user?: {
      name: string;
      image?: string | null;
    };
  };
  index?: number;
  onSelect?: () => void;
}

export const CompactTrackItem = ({
  track,
  index,
  onSelect,
}: CompactTrackItemProps) => {
  // Get player state and methods
  const { currentTrack, status, togglePlay, playTrack } = usePlayerStore(
    (state) => ({
      currentTrack: state.currentTrack,
      status: state.status,
      togglePlay: state.togglePlay,
      playTrack: state.playTrack,
    }),
  );

  // Determine if this track is currently playing
  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && status === "playing";

  // Handle play/pause
  const handlePlayPause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isCurrentTrack) {
        togglePlay();
      } else {
        playTrack(track);
      }

      if (onSelect) {
        onSelect();
      }
    },
    [isCurrentTrack, togglePlay, playTrack, track, onSelect],
  );

  return (
    <div
      className={`group flex cursor-pointer items-center rounded-md p-2 hover:bg-zinc-800/50 ${isCurrentTrack ? "bg-zinc-800/30" : ""}`}
      onClick={handlePlayPause}
    >
      {/* Track Number or Play Button */}
      <div className="w-8 flex-shrink-0 text-center">
        <div className="block text-sm text-zinc-400 group-hover:hidden">
          {index !== undefined ? index + 1 : ""}
        </div>
        <button
          onClick={handlePlayPause}
          className="hidden w-full items-center justify-center text-zinc-400 group-hover:flex hover:text-white"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </button>
      </div>

      {/* Track Cover */}
      <div className="relative mr-3 h-10 w-10 flex-shrink-0 overflow-hidden rounded">
        <img
          src={track.artworkUrl || "/placeholder-track.jpg"}
          alt={track.title}
          className="object-cover"
        />
      </div>

      {/* Track Info */}
      <div className="mr-3 min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-white">
          {track.title}
        </h3>
        <p className="truncate text-xs text-zinc-400">
          {track.user?.name || "Unknown Artist"}
        </p>
      </div>

      {/* Like Button */}
      <button
        className="flex h-8 w-8 items-center justify-center text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
        title="Like"
        onClick={(e) => {
          e.stopPropagation();
          console.log("Like", track.id);
        }}
      >
        <Heart className="h-4 w-4" />
      </button>

      {/* Track Duration */}
      <div className="w-12 text-right text-xs text-zinc-400">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
};

export default CompactTrackItem;
