'use client';

import { useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Heart,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
} from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { formatDuration } from '@/lib/utils';
import type { Track } from '@prisma/client';
import { shallow } from 'zustand/shallow';
import { usePathname } from 'next/navigation'

// Using React.memo to prevent unnecessary re-renders
const TrackInfo = memo(function TrackInfo() {
  const { currentTrack } = usePlayerStore(state => ({
    currentTrack: state.currentTrack
  }), shallow);

  if (!currentTrack) return null;

  return (
    <div className="flex items-center space-x-3 flex-shrink min-w-0">
      <img
        src={currentTrack.artworkUrl || '/placeholder-track.jpg'}
        alt="Now playing"
        className="w-10 h-10 object-cover rounded-sm flex-shrink-0"
      />
      <div className="flex-shrink min-w-0">
        <div className="text-sm font-medium truncate max-w-[120px] sm:max-w-[200px] text-gray-200">
          {currentTrack.title}
        </div>
        <div className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px]">
          {currentTrack.userId}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 hidden sm:flex text-gray-400 hover:text-white"
        onClick={() => console.log("Like clicked - implement state")}
      >
        <Heart className="w-4 h-4" />
      </Button>
    </div>
  );
});

// Using React.memo to prevent unnecessary re-renders
const PlaybackButtons = memo(function PlaybackButtons() {
  const {
    status,
    currentTrack,
    previousTrack,
    nextTrack,
    togglePlay,
  } = usePlayerStore(state => ({
    status: state.status,
    currentTrack: state.currentTrack,
    previousTrack: state.previousTrack,
    nextTrack: state.nextTrack,
    togglePlay: state.togglePlay,
  }), shallow);

  const isPlaying = status === 'playing';

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white absolute top-1/2 transform -translate-y-1/2 -left-10 hidden sm:flex"
        onClick={() => console.log("Shuffle clicked - implement state")}
        disabled={!currentTrack}
        title="Shuffle"
      >
        <Shuffle className="w-4 h-4 stroke-[1.5]" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white"
        onClick={previousTrack}
        disabled={!currentTrack}
        title="Previous"
      >
        <SkipBack className="w-4 h-4 stroke-[1.5]" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 bg-white text-black rounded-full hover:scale-105 hover:bg-gray-200 transition-transform duration-75 mx-1"
        onClick={togglePlay}
        disabled={!currentTrack}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-black stroke-[1.5]" />
        ) : (
          <Play className="w-5 h-5 fill-black stroke-[1.5] translate-x-[1px]" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white"
        onClick={nextTrack}
        disabled={!currentTrack}
        title="Next"
      >
        <SkipForward className="w-4 h-4 stroke-[1.5]" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white absolute top-1/2 transform -translate-y-1/2 -right-10 hidden sm:flex"
        onClick={() => console.log("Repeat clicked - implement state")}
        disabled={!currentTrack}
        title="Repeat"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
      </Button>
    </div>
  );
});

// Using React.memo to prevent unnecessary re-renders
const ProgressBar = memo(function ProgressBar() {
  const {
    currentTime,
    duration,
    seek,
  } = usePlayerStore(state => ({
    currentTime: state.currentTime,
    duration: state.duration,
    seek: state.seek,
  }), shallow);

  let progressBarRef = useRef<HTMLDivElement>(null);

  let handleProgressChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current && duration > 0) {
      let rect = progressBarRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      let newTime = (percentage / 100) * duration;
      seek(newTime);
    }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center w-full max-w-xl mt-1">
      <span className="text-xs tabular-nums text-gray-400 w-10 text-right pr-2">
        {formatDuration(currentTime)}
      </span>
      <div
        ref={progressBarRef}
        className="flex-grow mx-2 h-1 bg-neutral-600 rounded-full cursor-pointer relative group"
        onClick={handleProgressChange}
        title="Seek"
      >
        <div
          className="absolute top-0 left-0 h-full bg-neutral-400 rounded-full group-hover:bg-green-500 transition-colors duration-100"
          style={{
            width: `${progressPercentage}%`,
          }}
        >
          <div className="absolute right-0 top-1/2 w-3 h-3 bg-white rounded-full -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-100" />
        </div>
      </div>
      <span className="text-xs tabular-nums text-gray-400 w-10 text-left pl-2">
        {formatDuration(duration)}
      </span>
    </div>
  );
});

// Using React.memo to prevent unnecessary re-renders
const Volume = memo(function Volume() {
  const {
    currentTrack,
    volume,
    isMuted,
    setVolume,
    toggleMute
  } = usePlayerStore(state => ({
    currentTrack: state.currentTrack,
    volume: state.volume,
    isMuted: state.isMuted,
    setVolume: state.setVolume,
    toggleMute: state.toggleMute
  }), shallow);

  const volumeBarRef = useRef<HTMLDivElement>(null);

  let handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (volumeBarRef.current) {
      let rect = volumeBarRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setVolume(percentage / 100);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-gray-400 hover:text-white"
        onClick={toggleMute}
        disabled={!currentTrack}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted || volume === 0 ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </Button>
      <div
        ref={volumeBarRef}
        className="w-20 h-1 bg-neutral-600 rounded-full cursor-pointer relative group"
        onClick={handleVolumeChange}
        title="Volume"
      >
        <div
          className="absolute top-0 left-0 h-full bg-neutral-400 rounded-full group-hover:bg-green-500 transition-colors duration-100"
          style={{ width: `${volume * 100}%` }}
        >
          <div className="absolute right-0 top-1/2 w-3 h-3 bg-white rounded-full -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-100" />
        </div>
      </div>
    </div>
  );
});

export const PlaybackControls = memo(function PlaybackControls() {
  // get current url
  const pathname = usePathname()
  if (pathname.startsWith('/upload')) return null;
  
  return (
    <>
      <div className="h-[69px] fixed bottom-0 left-0 right-0 flex items-center justify-between p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-[#181818] border-t border-[#282828] z-50">
        <div className="flex items-center justify-between w-full max-w-screen-xl mx-auto px-4 sm:px-8">
          <div className="w-1/3 flex justify-start">
            <TrackInfo />
            {pathname}
          </div>

          <div className="flex flex-col items-center flex-grow min-w-[300px] max-w-lg">
            <PlaybackButtons />
            <ProgressBar />
          </div>

          <div className="w-1/3 flex justify-end items-center">
            <Volume />
          </div>
        </div>
      </div>
    </>
  );
});
