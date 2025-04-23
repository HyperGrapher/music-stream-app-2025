'use client';

import { usePlayerStore } from '@/store/player';
import { type Track } from '@prisma/client';
import { formatDuration } from '@/lib/utils';
import { useRef, useEffect, useState, useMemo, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, RefreshCw } from 'lucide-react';
import { shallow } from 'zustand/shallow';

type PlaylistWithSongs = {
  id: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  duration: number;
  songs: Track[];
} | any;

// Memoize TrackRow component to prevent unnecessary re-renders
const TrackRow = memo(function TrackRow({
  track,
  index,
  isSelected,
  isCurrentPlaying,
  onSelect,
}: {
  track: Track;
  index: number;
  isSelected: boolean;
  isCurrentPlaying: boolean;
  onSelect: () => void;
}) {
  // Consolidated store subscription with shallow equality
  const {
    playTrack,
    togglePlay,
    status
  } = usePlayerStore(
    (state) => ({
      playTrack: state.playTrack,
      togglePlay: state.togglePlay,
      status: state.status
    }),
    shallow // Use shallow equality to prevent unnecessary re-renders
  );

  // Check if this track is playing based on the current status
  const isPlaying = status === 'playing';

  let [isFocused, setIsFocused] = useState(false);

  function onClickTrackRow(e: React.MouseEvent) {
    e.preventDefault();
    console.log('onClickTrackRow', track);
    onSelect();

    // Always use playTrack, which internally handles toggling if it's the current track
    playTrack(track);
  }

  function onKeyDownTrackRow(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();

      // Always use playTrack, which internally handles toggling if it's the current track
      playTrack(track);
    }
  }

  return (
    <tr
      className={`group cursor-pointer hover:bg-zinc-700/50 select-none relative ${isCurrentPlaying ? 'bg-zinc-800/50 text-green-400' : ''
        }`}
      tabIndex={0}
      onKeyDown={onKeyDownTrackRow}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <td className="py-[2px] pl-3 pr-2 tabular-nums w-10 text-center">
        {isCurrentPlaying && isPlaying ? (
          <span className="flex items-end justify-center space-x-[2px] size-[0.65rem] mx-auto">
            <span className="w-1 bg-green-500 animate-now-playing-1"></span>
            <span className="w-1 bg-green-500 animate-now-playing-2 [animation-delay:0.2s]"></span>
            <span className="w-1 bg-green-500 animate-now-playing-3 [animation-delay:0.4s]"></span>
          </span>
        ) : (
          !isCurrentPlaying || (isCurrentPlaying && !isPlaying) ? (
            <span className="text-gray-400 group-hover:hidden block">{index + 1}</span>
          ) : null
        )}
        {!isCurrentPlaying && (
          <Play className="h-4 w-4 group-hover:block hidden mx-auto" onClick={onClickTrackRow} />
        )}
      </td>
      <td className="py-[2px] px-2">
        <span className="flex items-center">
          <div className="relative mr-2">
            <Button onClick={onClickTrackRow} variant="ghost" size="icon" className="h-6 w-6">
              {isCurrentPlaying && isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <PauseOrLoadingIcon status={status} isCurrent={isCurrentPlaying} />
              )}
            </Button>
          </div>
          <span className="font-medium truncate max-w-[180px] sm:max-w-[200px] text-[#d1d5db]">
            {track.title}
            <span className="sm:hidden text-gray-400 ml-1">
              • {track.userId}
            </span>
          </span>
        </span>
      </td>
      <td className="py-[2px] px-2 hidden sm:table-cell text-[#d1d5db] max-w-40 truncate">
        {track.userId}
      </td>
      <td className="py-[2px] px-2 hidden md:table-cell text-[#d1d5db]">
        {track.albumId}
      </td>
      <td className="py-[2px] px-2 tabular-nums text-[#d1d5db]">
        {formatDuration(track.duration)}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these props change
  return (
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isCurrentPlaying === nextProps.isCurrentPlaying &&
    prevProps.track.id === nextProps.track.id &&
    prevProps.index === nextProps.index
  );
});


function PauseOrLoadingIcon({ status, isCurrent }: { status: string, isCurrent: boolean }) {
  if (status === 'loading' && isCurrent) return <RefreshCw className="w-3 h-3 animate-spin" />;
  return <Pause className="h-4 w-4" />;
}


export function TrackTable({
  playlist,
  query,
}: {
  playlist: PlaylistWithSongs;
  query?: string;
}) {
  let tableRef = useRef<HTMLTableElement>(null);

  // Consolidated store subscription with shallow equality
  const {
    setPlaylist,
    currentTrack,
  } = usePlayerStore(state => ({
    setPlaylist: state.setPlaylist,
    currentTrack: state.currentTrack,
  }), shallow);

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  useEffect(() => {
    // Set the playlist in the store
    setPlaylist(playlist.songs);
  }, [playlist.songs, setPlaylist]);

  // Memoize the rendered rows to prevent unnecessary re-renders
  const renderedRows = useMemo(() => {
    return playlist.songs.map((track: Track, index: number) => (
      <TrackRow
        key={track.id}
        track={track}
        index={index}
        isSelected={selectedTrackId === track.id}
        isCurrentPlaying={currentTrack?.id === track.id}
        onSelect={() => setSelectedTrackId(track.id)}
      />
    ));
  }, [playlist.songs, selectedTrackId, currentTrack]);

  return (
    <table
      ref={tableRef}
      className="w-full text-xs"
    >
      <thead className="sticky top-0 bg-[#0A0A0A] z-10 border-b border-[#282828]">
        <tr className="text-left text-gray-400">
          <th className="py-2 pl-3 pr-2 font-medium w-10">#</th>
          <th className="py-2 px-2 font-medium">Title</th>
          <th className="py-2 px-2 font-medium hidden sm:table-cell">Artist</th>
          <th className="py-2 px-2 font-medium hidden md:table-cell">Album</th>
          <th className="py-2 px-2 font-medium">Duration</th>
        </tr>
      </thead>
      <tbody className="mt-[1px]">
        {renderedRows}
      </tbody>
    </table>
  );
}
