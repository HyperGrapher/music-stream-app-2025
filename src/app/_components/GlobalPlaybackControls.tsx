'use client';

import { useRef, memo } from 'react';
import Link from 'next/link';
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
  Repeat,
  Repeat1,
  ListMusic,
  ChevronDown,
} from 'lucide-react';
import { usePlayerStore, useKeyboardControls } from '@/store/player';
import { useTrackLike } from '@/hooks/useTrackLike';
import { useUser } from '@/hooks/useUser';
import { useAuthPrompt } from '@/store/authPrompt';
import { useDialogs } from '@/store/dialogs';
import { TrackMenu } from '@/components/player/TrackMenu';
import { FollowButton } from '@/components/FollowButton';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { usePathname } from 'next/navigation'
import { ARTWORK_SIZES } from "@/lib/artwork";

/** Like state of the playing track (shared by the bar, the sheet and the `L` shortcut). */
function BarLike({ className }: { className?: string }) {
  const track = usePlayerStore((state) => state.currentTrack);
  if (!track) return null;
  return <BarLikeFor key={track.id} className={className} track={track} />;
}

function BarLikeFor({ track, className }: { track: NonNullable<ReturnType<typeof usePlayerStore.getState>['currentTrack']>; className?: string }) {
  const { user } = useUser();
  const { liked, toggle } = useTrackLike(track.id, track.likedByMe ?? false, track.likeCount ?? 0, track.accessQuery);
  if (user?.id === track.userId) return null; // VI-2: no like on your own tracks
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8 flex-shrink-0 text-gray-400 hover:text-white', className)}
      onClick={toggle}
      data-bar-like
      aria-pressed={liked}
      aria-label={liked ? 'Unlike current track' : 'Like current track'}
      disabled={track.isPrivate && !liked}
    >
      <Heart className={cn('w-4 h-4', liked && 'fill-current text-orange-500')} />
    </Button>
  );
}

function TrackInfo() {
  const { currentTrack } = usePlayerStore(useShallow(state => ({
    currentTrack: state.currentTrack
  })));
  const { user } = useUser();

  if (!currentTrack) return null;
  const artist = currentTrack.artistName ?? currentTrack.user?.name;

  return (
    <div className="flex items-center space-x-3 flex-shrink min-w-0">
      <img
        src={currentTrack.artworkUrl ?? '/placeholder-track.jpg'}
        srcSet={currentTrack.artworkSrcSet ?? undefined}
        sizes={ARTWORK_SIZES.thumbnail}
        alt="Now playing"
        className="w-10 h-10 object-cover rounded-sm flex-shrink-0"
      />
      <div className="flex-shrink min-w-0">
        <Link href={currentTrack.permalink ?? '#'} className="block py-0.5 text-sm font-medium truncate max-w-[120px] sm:max-w-[200px] text-gray-200 hover:underline">
          {currentTrack.title}
        </Link>
        {currentTrack.user?.username ? (
          <Link href={`/${currentTrack.user.username}`} className="block py-1 text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px] hover:underline">
            {artist}
          </Link>
        ) : (
          <div className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px]">{artist}</div>
        )}
      </div>
      <BarLike className="hidden sm:flex" />
      {currentTrack.userId && user?.id !== currentTrack.userId ? (
        <span className="hidden lg:block"><FollowButton key={currentTrack.userId} userId={currentTrack.userId} initialFollowing={false} size="sm" /></span>
      ) : null}
      <TrackMenu track={currentTrack} className="hidden sm:inline-flex" />
    </div>
  );
};

// Using React.memo to prevent unnecessary re-renders
const PlaybackButtons = memo(function PlaybackButtons() {
  const {
    status,
    currentTrack,
    previousTrack,
    nextTrack,
    togglePlay,
    shuffle,
    repeat,
    toggleShuffle,
    cycleRepeat,
  } = usePlayerStore(useShallow(state => ({
    status: state.status,
    currentTrack: state.currentTrack,
    previousTrack: state.previousTrack,
    nextTrack: state.nextTrack,
    togglePlay: state.togglePlay,
    shuffle: state.shuffle,
    repeat: state.repeat,
    toggleShuffle: state.toggleShuffle,
    cycleRepeat: state.cycleRepeat,
  })));

  const isPlaying = status === 'playing';

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 relative">
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 absolute top-1/2 transform -translate-y-1/2 -left-10 hidden sm:flex', shuffle ? 'text-orange-500 hover:text-orange-400' : 'text-gray-400 hover:text-white')}
        onClick={toggleShuffle}
        disabled={!currentTrack}
        title={shuffle ? 'Shuffle on' : 'Shuffle off'}
        aria-pressed={shuffle}
        aria-label="Shuffle"
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
        className={cn('h-8 w-8 absolute top-1/2 transform -translate-y-1/2 -right-10 hidden sm:flex', repeat === 'off' ? 'text-gray-400 hover:text-white' : 'text-orange-500 hover:text-orange-400')}
        onClick={cycleRepeat}
        disabled={!currentTrack}
        title={`Repeat: ${repeat}`}
        aria-label={`Repeat: ${repeat}`}
      >
        {repeat === 'one' ? <Repeat1 className="w-4 h-4 stroke-[1.5]" /> : <Repeat className="w-4 h-4 stroke-[1.5]" />}
      </Button>
    </div>
  );
});

// Using React.memo to prevent unnecessary re-renders
function ProgressBar() {
  const {
    currentTime,
    duration,
    seek,
    bufferedEnd,
  } = usePlayerStore(useShallow(state => ({
    currentTime: state.currentTime,
    duration: state.duration,
    seek: state.seek,
    bufferedEnd: state.bufferedEnd,
  })));

  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleProgressChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (progressBarRef.current && duration > 0) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newTime = (percentage / 100) * duration;
      seek(newTime);
    }
  };

  const progressPercentage =
    duration > 0
      ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
      : 0;

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
          className="absolute top-0 left-0 h-full bg-neutral-500 rounded-full"
          style={{ width: `${duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0}%` }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 h-full bg-neutral-400 rounded-full group-hover:bg-green-500 transition-colors duration-100"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(currentTime)}
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
};

// Using React.memo to prevent unnecessary re-renders
const Volume = memo(function Volume() {
  const {
    currentTrack,
    volume,
    isMuted,
    setVolume,
    toggleMute
  } = usePlayerStore(useShallow(state => ({
    currentTrack: state.currentTrack,
    volume: state.volume,
    isMuted: state.isMuted,
    setVolume: state.setVolume,
    toggleMute: state.toggleMute
  })));

  const volumeBarRef = useRef<HTMLDivElement>(null);

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (volumeBarRef.current) {
      const rect = volumeBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
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

function QueueButton({ className }: { className?: string }) {
  const { open, count, set } = usePlayerStore(useShallow((state) => ({ open: state.nextUpOpen, count: state.userQueue.length, set: state.setNextUpOpen })));
  return (
    <Button variant="ghost" size="icon" className={cn('h-8 w-8 relative', open ? 'text-orange-500' : 'text-gray-400 hover:text-white', className)} onClick={() => set(!open)} aria-pressed={open} aria-label="Next up" title="Next up (Q)">
      <ListMusic className="w-4 h-4" />
      {count > 0 ? <span className="absolute -top-0.5 -right-0.5 rounded-full bg-orange-700 px-1 text-[10px] leading-4 text-white">{count}</span> : null}
    </Button>
  );
}

/** Phone: a mini player; tapping it opens the full-screen sheet (PRD mobile). */
function MiniPlayer() {
  const { currentTrack, status, togglePlay, currentTime, duration, setSheetOpen } = usePlayerStore(useShallow((state) => ({
    currentTrack: state.currentTrack, status: state.status, togglePlay: state.togglePlay, currentTime: state.currentTime, duration: state.duration, setSheetOpen: state.setSheetOpen,
  })));
  if (!currentTrack) return null;
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div className="right-scroll-bar-position sm:hidden fixed left-0 right-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-50 bg-[#181818] border-t border-[#282828]">
      <div className="h-0.5 bg-neutral-700"><div className="h-full bg-orange-700" style={{ width: `${pct}%` }} /></div>
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setSheetOpen(true)}>
          <span className="sr-only">Open player: </span>
          <img src={currentTrack.artworkUrl ?? '/placeholder-track.jpg'} alt="" className="h-10 w-10 rounded-sm object-cover" />
          <span className="min-w-0">
            <span className="block truncate text-sm text-gray-200">{currentTrack.title}</span>
            <span className="block truncate text-xs text-gray-400">{currentTrack.artistName ?? currentTrack.user?.name}</span>
          </span>
        </button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={togglePlay} aria-label={status === 'playing' ? 'Pause' : 'Play'}>
          {status === 'playing' ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
        </Button>
      </div>
    </div>
  );
}

function PlayerSheet() {
  const { open, track, setOpen } = usePlayerStore(useShallow((state) => ({ open: state.sheetOpen, track: state.currentTrack, setOpen: state.setSheetOpen })));
  if (!open || !track) return null;
  return (
    <div role="dialog" aria-label="Player" className="sm:hidden fixed inset-0 z-[60] flex flex-col gap-4 bg-zinc-950 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close player"><ChevronDown className="w-6 h-6" /></Button>
        <TrackMenu track={track} />
      </div>
      <img src={track.artworkUrl ?? '/placeholder-track.jpg'} alt="" className="mx-auto aspect-square w-full max-w-sm rounded-md object-cover" />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={track.permalink ?? '#'} onClick={() => setOpen(false)} className="block truncate text-lg font-semibold">{track.title}</Link>
          <p className="truncate text-sm text-gray-400">{track.artistName ?? track.user?.name}</p>
        </div>
        <BarLike />
      </div>
      <div className="flex flex-col items-center"><ProgressBar /></div>
      <div className="flex justify-center pt-2"><PlaybackButtons /></div>
      <div className="flex justify-center gap-6">
        <ShuffleRepeat />
        <QueueButton />
      </div>
    </div>
  );
}

/** Shuffle and repeat for places where the bar's absolutely positioned buttons do not fit (the phone sheet). */
function ShuffleRepeat() {
  const { shuffle, repeat, toggleShuffle, cycleRepeat } = usePlayerStore(useShallow((state) => ({ shuffle: state.shuffle, repeat: state.repeat, toggleShuffle: state.toggleShuffle, cycleRepeat: state.cycleRepeat })));
  return (
    <>
      <Button variant="ghost" size="icon" className={shuffle ? 'text-orange-500' : 'text-gray-400'} onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle"><Shuffle className="w-5 h-5" /></Button>
      <Button variant="ghost" size="icon" className={repeat === 'off' ? 'text-gray-400' : 'text-orange-500'} onClick={cycleRepeat} aria-label={`Repeat: ${repeat}`}>{repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}</Button>
    </>
  );
}

export function PlaybackControls() {
  // get current url
  const pathname = usePathname()
  const track = usePlayerStore((state) => state.currentTrack);
  const { user } = useUser();
  useKeyboardControls({
    onLike: () => {
      if (!track) return;
      if (!user) useAuthPrompt.getState().show('Sign in to like tracks');
      else document.querySelector<HTMLButtonElement>('[data-bar-like]')?.click();
    },
    onHelp: () => useDialogs.getState().setShortcutsOpen(true),
  });
  if (pathname.startsWith('/upload')) return null;

  return (
    <>
      <MiniPlayer />
      <PlayerSheet />
      <div className="right-scroll-bar-position hidden sm:flex h-[69px] fixed bottom-0 left-0 right-0 items-center justify-between p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-[#181818] border-t border-[#282828] z-50">
        <div className="flex items-center justify-between w-full max-w-screen-xl mx-auto px-4 sm:px-8">
          <div className="w-1/3 flex justify-start">
            <TrackInfo />
          </div>

          <div className="flex flex-col items-center flex-grow min-w-[300px] max-w-lg">
            <PlaybackButtons />
            <ProgressBar />
          </div>

          <div className="w-1/3 flex justify-end items-center">
            <QueueButton />
            <Volume />
          </div>
        </div>
      </div>
    </>
  );
};
