"use client";

import { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { Heart, MessageCircle, Share, MoreHorizontal, Pause, Play } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import WaveformVisualizer from "./WaveformVisualizer";
import { usePlayerStore } from "@/store/player";
import type { Track } from "@prisma/client";
import { formatDuration } from "@/lib/utils";

interface WaveformTrackItemProps {
  track: Track & {
    user?: {
      name: string;
      image?: string | null;
    };
  };
  waveformData?: number[];
  compact?: boolean;
}

export const WaveformTrackItem = ({ 
  track, 
  waveformData = [], 
  compact = false 
}: WaveformTrackItemProps) => {
  // Parse waveform data from track if provided as string
  const parsedWaveformData = useMemo(() => {
    if (waveformData.length > 0) return waveformData;
    if (track.waveformData) {
      try {
        return JSON.parse(track.waveformData);
      } catch (e) {
        console.error("Error parsing waveform data:", e);
        // Generate random waveform data as fallback
        return Array.from({ length: 100 }, () => Math.floor(Math.random() * 100));
      }
    }
    // Generate random waveform data as fallback
    return Array.from({ length: 100 }, () => Math.floor(Math.random() * 100));
  }, [track.waveformData, waveformData]);

  // Get player state and methods
  const { 
    currentTrack, 
    status, 
    currentTime, 
    duration, 
    togglePlay, 
    playTrack, 
    seek 
  } = usePlayerStore(state => ({
    currentTrack: state.currentTrack,
    status: state.status,
    currentTime: state.currentTime,
    duration: state.duration,
    togglePlay: state.togglePlay,
    playTrack: state.playTrack,
    seek: state.seek
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
  }, [isCurrentTrack, togglePlay, playTrack, track]);

  // Handle seek on waveform
  const handleSeek = useCallback((position: number) => {
    if (isCurrentTrack) {
      seek(position);
    } else {
      playTrack(track);
      // Small delay to ensure track is loaded before seeking
      setTimeout(() => seek(position), 100);
    }
  }, [isCurrentTrack, seek, playTrack, track]);

  return (
    <div className="bg-zinc-900 rounded-md border border-zinc-800 p-3 mb-4 group">
      <div className="flex gap-3">
        {/* Cover Art & Play Button Section */}
        <div className="relative min-w-16 w-16 h-16 md:min-w-20 md:w-20 md:h-20 rounded overflow-hidden">
          <img
            src={track.artworkUrl || "/placeholder-track.jpg"}
            alt={track.title}
            className="object-cover"
          />
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-1" />
              )}
            </div>
          </button>
        </div>

        {/* Track Info Section */}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center mb-1">
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
              <div className="text-gray-400 text-xs">
                {track.user?.name || "Unknown Artist"}
              </div>
              <h3 className="text-sm md:text-base font-medium truncate text-white">
                {track.title}
              </h3>
            </div>
            <div className="ml-auto text-xs text-gray-500">
              {formatDistanceToNow(new Date(track.createdAt), { addSuffix: true })}
            </div>
          </div>

          {/* Waveform Section */}
          <div className="h-12 md:h-16 relative mt-2">
            <WaveformVisualizer
              waveformData={parsedWaveformData}
              duration={track.duration}
              currentTime={isCurrentTrack ? currentTime : 0}
              onSeek={handleSeek}
              height={compact ? 32 : 52}
              color="#999999"
              progressColor="#f50"
              backgroundColor="transparent"
            />
            {track.genre && (
              <div className="absolute top-0 right-0 bg-zinc-800 text-xs text-white px-2 py-1 rounded">
                {track.genre}
              </div>
            )}
            <div className="absolute bottom-0 right-0 text-xs text-gray-400">
              {formatDuration(track.duration)}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white"
              title="Like"
            >
              <Heart className="w-4 h-4" />
            </Button>
            <span className="text-xs text-gray-500">{track.likeCount}</span>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white ml-2"
              title="Comment"
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
            <span className="text-xs text-gray-500">{track.commentCount}</span>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white ml-2"
              title="Share"
            >
              <Share className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white ml-auto"
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaveformTrackItem; 