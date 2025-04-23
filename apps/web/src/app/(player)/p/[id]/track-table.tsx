'use client';

import { usePlaybackStore } from '@/store/playback';
import { type Track } from '@prisma/client';
import { formatDuration } from '@/lib/utils';
import { useRef, useEffect, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play } from 'lucide-react';

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
  const { playTrack, togglePlayPause, setActivePanel, handleKeyNavigation } = usePlaybackStore(
    (state) => ({
      playTrack: state.playTrack,
      togglePlayPause: state.togglePlayPause,
      setActivePanel: state.setActivePanel,
      handleKeyNavigation: state.handleKeyNavigation,
    })
  );
  const isPlaying = usePlaybackStore((state) => state.isPlaying);

  useEffect(() => {console.log("TrackRow re-renders: isPlaying:", isPlaying);});

  let [isFocused, setIsFocused] = useState(false);

  function onClickTrackRow(e: React.MouseEvent) {
    e.preventDefault();
    console.log('onClickTrackRow', track);
    setActivePanel('tracklist');
    onSelect();
    if (isCurrentPlaying) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  }

  function onKeyDownTrackRow(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
      if (isCurrentPlaying) {
        togglePlayPause();
      } else {
        playTrack(track);
      }
    } else {
      handleKeyNavigation(e);
    }
  }

  return (
    <tr
      className={`group cursor-pointer hover:bg-zinc-700/50 select-none relative ${
        isCurrentPlaying ? 'bg-zinc-800/50 text-green-400' : ''
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
                <Play className="h-4 w-4" />
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
}

export function TrackTable({
  playlist,
  query,
}: {
  playlist: PlaylistWithSongs;
  query?: string;
}) {
  let tableRef = useRef<HTMLTableElement>(null);
  const {
    registerPanelRef,
    setActivePanel,
    setPlaylist,
  } = usePlaybackStore(state => ({
    registerPanelRef: state.registerPanelRef,
    setActivePanel: state.setActivePanel,
    setPlaylist: state.setPlaylist,
  }));
  const currentTrackId = usePlaybackStore((state) => state.currentTrack?.id);
  useEffect(() => {console.log("TrackTable re-renders: Current track:", currentTrackId);});

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  useEffect(() => {
    console.log("TrackTable: Registering panel ref");
    registerPanelRef('tracklist', tableRef as unknown as RefObject<HTMLElement>);
  }, [registerPanelRef]);

  useEffect(() => {
    console.log("TrackTable: Setting playlist in store");
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
            isSelected={selectedTrackId === track.id}
            isCurrentPlaying={currentTrackId === track.id}
            onSelect={() => setSelectedTrackId(track.id)}
          />
        ))}
      </tbody>
    </table>
  );
}
