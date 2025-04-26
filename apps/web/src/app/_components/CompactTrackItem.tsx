"use client";

import { useCallback } from "react";
import Image from "next/image";
import { Pause, Play, Heart } from "lucide-react";
import { usePlayerStore } from "@/store/player";
import type { Track } from "@prisma/client";
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
  onSelect 
}: CompactTrackItemProps) => {
  // Get player state and methods
  const { 
    currentTrack, 
    status, 
    togglePlay, 
    playTrack
  } = usePlayerStore(state => ({
    currentTrack: state.currentTrack,
    status: state.status,
    togglePlay: state.togglePlay,
    playTrack: state.playTrack
  }));

  // Determine if this track is currently playing
  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && status === 'playing';

  // Handle play/pause
  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isCurrentTrack) {
      togglePlay();
    } else {
      playTrack(track);
    }
    
    if (onSelect) {
      onSelect();
    }
  }, [isCurrentTrack, togglePlay, playTrack, track, onSelect]);

  return (
    <div 
      className={`flex items-center p-2 hover:bg-zinc-800/50 rounded-md group cursor-pointer ${isCurrentTrack ? 'bg-zinc-800/30' : ''}`}
      onClick={handlePlayPause}
    >
      {/* Track Number or Play Button */}
      <div className="w-8 flex-shrink-0 text-center">
        <div className="group-hover:hidden block text-zinc-400 text-sm">
          {index !== undefined ? index + 1 : ''}
        </div>
        <button
          onClick={handlePlayPause}
          className="hidden group-hover:flex items-center justify-center text-zinc-400 hover:text-white w-full"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>
      </div>

      {/* Track Cover */}
      <div className="relative h-10 w-10 rounded overflow-hidden mr-3 flex-shrink-0">
        <img
          src={track.artworkUrl || "/placeholder-track.jpg"}
          alt={track.title}
          className="object-cover"
        />
      </div>

      {/* Track Info */}
      <div className="flex-1 min-w-0 mr-3">
        <h3 className="text-sm font-medium truncate text-white">
          {track.title}
        </h3>
        <p className="text-xs text-zinc-400 truncate">
          {track.user?.name || "Unknown Artist"}
        </p>
      </div>

      {/* Like Button */}
      <button
        className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title="Like"
        onClick={(e) => {
          e.stopPropagation(); 
          console.log('Like', track.id);
        }}
      >
        <Heart className="w-4 h-4" />
      </button>

      {/* Track Duration */}
      <div className="text-xs text-zinc-400 w-12 text-right">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
};

export default CompactTrackItem; 