'use client';

import { usePlayback } from '@/app/hooks/usePlayback';
import { type Track } from '@prisma/client';
import { formatDuration } from '@/lib/utils';
import { useRef, useEffect, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';

type PlaylistWithSongs = {
  id: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  duration: number;
  songs: Track[];
} | any;

function TrackRow({
  track,
  index,
  query,
  isSelected,
  onSelect,
}: {
  track: Track;
  index: number;
  query?: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  let {
    currentTrack,
    playTrack,
    togglePlayPause,
    isPlaying,
    setActivePanel,
    handleKeyNavigation,
  } = usePlayback();
  // let { playlists } = usePlaylist();

  let [isFocused, setIsFocused] = useState(false);
  let isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
  let isCurrentTrack = currentTrack?.title === track.title;

  function onClickTrackRow(e: React.MouseEvent) {
    e.preventDefault();
    setActivePanel('tracklist');
    onSelect();
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  }

  function onKeyDownTrackRow(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
      if (isCurrentTrack) {
        togglePlayPause();
      } else {
        playTrack(track);
      }
    } else {
      handleKeyNavigation(e, 'tracklist');
    }
  }

  return (
    <tr
      className={`group cursor-pointer hover:bg-zinc-700/50 select-none relative ${isCurrentTrack ? 'bg-zinc-800/50' : ''
        }`}
      tabIndex={0}
      // onClick={onClickTrackRow}
      onKeyDown={onKeyDownTrackRow}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      <td className="py-[2px] pl-3 pr-2 tabular-nums w-10 text-center">
        {true ? (
          <span className="flex items-end justify-center space-x-[2px] size-[0.65rem] mx-auto">
            <span className="w-1 bg-neutral-600 animate-now-playing-1"></span>
            <span className="w-1 bg-neutral-600 animate-now-playing-2 [animation-delay:0.2s]"></span>
            <span className="w-1 bg-neutral-600 animate-now-playing-3 [animation-delay:0.4s]"></span>
          </span>
        ) : (
          <span className="text-gray-400">{index + 1}</span>
        )}
      </td>
      <td className="py-[2px] px-2">
        <span className="flex items-center">
          <div className="relative  mr-2">

            <Button onClick={() =>  playTrack(track)} variant="ghost" size="icon" className="">Play</Button>
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
}

export function TrackTable({
  playlist,
  query,
}: {
  playlist: PlaylistWithSongs;
  query?: string;
}) {
  let tableRef = useRef<HTMLTableElement>(null);
  let { registerPanelRef, setActivePanel, setPlaylist } = usePlayback();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  useEffect(() => {
    registerPanelRef('tracklist', tableRef as unknown as RefObject<HTMLElement>);
  }, [registerPanelRef]);

  useEffect(() => {
    setPlaylist(playlist.songs);
  }, [playlist.songs, setPlaylist]);

  return (
    <table
      ref={tableRef}
      className="w-full text-xs"
      onClick={() => setActivePanel('tracklist')}
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
        {playlist.songs.map((track: Track, index: number) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            query={query}
            isSelected={selectedTrackId === track.id}
            onSelect={() => setSelectedTrackId(track.id)}
          />
        ))}
      </tbody>
    </table>
  );
}
