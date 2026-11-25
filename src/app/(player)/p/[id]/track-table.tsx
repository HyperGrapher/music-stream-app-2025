"use client";

import { usePlayerStore } from "@/store/player";
import type { PlayerTrack as Track } from "@/types/player-track";
import { formatDuration } from "@/lib/utils";
import { useEffect, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play, RefreshCw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

type PlaylistWithSongs = {
  id: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  duration: number;
  songs: Track[];
};

// Memoize TrackRow component to prevent unnecessary re-renders
const TrackRow = memo(
  function TrackRow({
    track,
    index,
    isCurrentPlaying,
  }: {
    track: Track;
    index: number;
    isCurrentPlaying: boolean;
  }) {
    // Consolidated store subscription with shallow equality
    const { playTrack, status } = usePlayerStore(useShallow(
      (state) => ({
        playTrack: state.playTrack,
        status: state.status,
      })));

    // Check if this track is playing based on the current status
    const isPlaying = status === "playing";

    function onClickTrackRow(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();

      // Always use playTrack, which internally handles toggling if it's the current track
      playTrack(track);
    }

    function onKeyDownTrackRow(e: React.KeyboardEvent<HTMLTableRowElement>) {
      if (e.target !== e.currentTarget) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();

        // Always use playTrack, which internally handles toggling if it's the current track
        playTrack(track);
      }
    }

    return (
      <tr
        className={`group relative cursor-pointer select-none hover:bg-zinc-700/50 ${
          isCurrentPlaying ? "bg-zinc-800/50 text-green-400" : ""
        }`}
        tabIndex={0}
        onClick={onClickTrackRow}
        onKeyDown={onKeyDownTrackRow}
      >
        <td className="w-10 py-[2px] pr-2 pl-3 text-center tabular-nums">
          {isCurrentPlaying && isPlaying ? (
            <span className="mx-auto flex size-[0.65rem] items-end justify-center space-x-[2px]">
              <span className="animate-now-playing-1 w-1 bg-green-500"></span>
              <span className="animate-now-playing-2 w-1 bg-green-500 [animation-delay:0.2s]"></span>
              <span className="animate-now-playing-3 w-1 bg-green-500 [animation-delay:0.4s]"></span>
            </span>
          ) : !isCurrentPlaying || (isCurrentPlaying && !isPlaying) ? (
            <span className="block text-gray-400 group-hover:hidden">
              {index + 1}
            </span>
          ) : null}
          {!isCurrentPlaying && (
            <Play
              className="mx-auto hidden h-4 w-4 group-hover:block"
              onClick={onClickTrackRow}
            />
          )}
        </td>
        <td className="px-2 py-[2px]">
          <span className="flex items-center">
            <div className="relative mr-2">
              <Button
                onClick={onClickTrackRow}
                variant="ghost"
                size="icon"
                className="h-6 w-6"
              >
                {isCurrentPlaying && isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <PauseOrLoadingIcon
                    status={status}
                    isCurrent={isCurrentPlaying}
                  />
                )}
              </Button>
            </div>
            <span className="max-w-[180px] truncate font-medium text-[#d1d5db] sm:max-w-[200px]">
              {track.title}
              <span className="ml-1 text-gray-400 sm:hidden">
                • {track.userId}
              </span>
            </span>
          </span>
        </td>
        <td className="hidden max-w-40 truncate px-2 py-[2px] text-[#d1d5db] sm:table-cell">
          {track.userId}
        </td>
        <td className="hidden px-2 py-[2px] text-[#d1d5db] md:table-cell">
          {track.albumId}
        </td>
        <td className="px-2 py-[2px] text-[#d1d5db] tabular-nums">
          {formatDuration(track.duration)}
        </td>
      </tr>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for memo
    // Only re-render if these props change
    return (
      prevProps.isCurrentPlaying === nextProps.isCurrentPlaying &&
      prevProps.track.id === nextProps.track.id &&
      prevProps.index === nextProps.index
    );
  },
);

function PauseOrLoadingIcon({
  status,
  isCurrent,
}: {
  status: string;
  isCurrent: boolean;
}) {
  if (status === "loading" && isCurrent)
    return <RefreshCw className="h-3 w-3 animate-spin" />;
  return <Play className="h-4 w-4" />;
}

export function TrackTable({
  playlist,
}: {
  playlist: PlaylistWithSongs;
  query?: string;
}) {
  // Consolidated store subscription with shallow equality
  const { setPlaylist, currentTrack } = usePlayerStore(useShallow(
    (state) => ({
      setPlaylist: state.setPlaylist,
      currentTrack: state.currentTrack,
    })));

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
        isCurrentPlaying={currentTrack?.id === track.id}
      />
    ));
  }, [playlist.songs, currentTrack]);

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10 border-b border-[#282828] bg-[#0A0A0A]">
        <tr className="text-left text-gray-400">
          <th className="w-10 py-2 pr-2 pl-3 font-medium">#</th>
          <th className="px-2 py-2 font-medium">Title</th>
          <th className="hidden px-2 py-2 font-medium sm:table-cell">Artist</th>
          <th className="hidden px-2 py-2 font-medium md:table-cell">Album</th>
          <th className="px-2 py-2 font-medium">Duration</th>
        </tr>
      </thead>
      <tbody className="mt-[1px]">{renderedRows}</tbody>
    </table>
  );
}
