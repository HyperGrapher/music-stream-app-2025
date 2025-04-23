'use client';

import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/player';

export function NowPlayingCard() {
  const currentTrack = usePlayerStore(state => state.currentTrack);
  console.log({ currentTrack }); // TODO: rerenders all the time. continuesly prints the current track

  if (!currentTrack) {
    return null;
  }

  const currentImageUrl = currentTrack.artworkUrl;

  return (
    <div className={cn(
      "hidden md:flex flex-col w-56 p-4 xbg-[#121212] overflow-auto bg-zinc-800 trtrtr",
      'absolute bottom-1/3 right-0 z-50'
    )}>
      <h2 className="mb-3 text-sm font-semibold text-gray-200">Now Playing</h2>
      <div className="relative w-full aspect-square mb-3 group">
        <img
          src={currentImageUrl || '/placeholder.svg'}
          alt={currentTrack.title}
          className="w-full h-full object-cover"
        />

      </div>
      <div className="w-full space-y-1">
        <Trackinfo
          title={currentTrack.title}
          trackId={currentTrack.id}
          label="Title"
        />
        <Trackinfo
          title={currentTrack.userId}
          trackId={currentTrack.id}
          label="Artist"
        />
        <Trackinfo
          title={currentTrack.genre || ''}
          trackId={currentTrack.id}
          label="Genre"
        />
        <Trackinfo
          title={currentTrack.bpm?.toString() || '120'}
          trackId={currentTrack.id}
          label="BPM"
        />
        <Trackinfo
          title={currentTrack.key || ''}
          trackId={currentTrack.id}
          label="Key"
        />
      </div>
    </div>
  );
}

interface TrackInfoProps {
  title: string;
  trackId: string;
  label: string;
}

export function Trackinfo({
  title,
  trackId,
  label,
}: TrackInfoProps) {


  return (
    <div className="space-y-1 group">
      <label
        htmlFor={`${label}-input`}
        className="text-xs text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex items-center justify-between w-full text-xs h-3 border-b border-transparent focus-within:border-white transition-colors">

        <div
          className="w-full cursor-pointer truncate block"
          role="button"
          tabIndex={0}

          aria-label={`Edit ${label}`}
        >
          <span className={cn('text-muted-foreground')}>
            {title || '-'}
          </span>
        </div>


      </div>

    </div>
  );
}
