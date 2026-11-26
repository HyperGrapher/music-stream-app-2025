"use client";

import { Pause, Play } from "lucide-react";

import { useAudioEvents, usePlayerStore } from "@/store/player";
import { EmbedWaveform } from "./EmbedWaveform";
import { formatDuration } from "@/lib/utils";
import type { PlayerTrack } from "@/types/player-track";

/** Compact player for iframes (PRD sharing): plays one track or a set, links back to the full page. */
export function EmbedPlayer({ tracks, title, href, collectionId }: { tracks: PlayerTrack[]; title: string; href: string; collectionId?: string }) {
  useAudioEvents();
  const { currentTrack, status, currentTime, duration, playContext, pause, play, seek } = usePlayerStore();
  const first = tracks[0];
  const current = currentTrack && tracks.some((t) => t.id === currentTrack.id) ? currentTrack : first;
  const active = currentTrack?.id === current?.id;
  const playing = active && (status === "playing" || status === "loading");
  const total = active && duration > 0 ? duration : (current?.duration ?? 0);
  const elapsed = active ? currentTime : 0;

  const toggle = (track: PlayerTrack | undefined) => {
    if (!track) return;
    if (currentTrack?.id === track.id) {
      if (playing) pause();
      else play();
    } else {
      playContext(tracks, track, { name: title, source: "EMBED", collectionId });
    }
  };

  if (!current) return <p className="p-4 text-sm text-zinc-400">Nothing to play here.</p>;
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        {current.artworkUrl ? (
          <img src={current.artworkUrl} alt="" className="size-20 shrink-0 rounded object-cover" />
        ) : (
          <div className="size-20 shrink-0 rounded bg-zinc-800" />
        )}
        <div className="min-w-0 flex-1">
          <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold hover:underline">{current.title}</a>
          <p className="truncate text-sm text-zinc-400">{current.artistName ?? current.user?.name}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => toggle(current)} aria-label={playing ? "Pause" : "Play"} className="flex size-9 items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-500">
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={Math.max(1, Math.floor(total))}
              value={Math.min(Math.floor(elapsed), Math.floor(total))}
              onChange={(event) => active && seek(Number(event.target.value))}
              className="h-1 flex-1 accent-cyan-500"
            />
            <span className="w-20 text-right text-xs tabular-nums text-zinc-400">{formatDuration(elapsed)} / {formatDuration(total)}</span>
          </div>
        </div>
      </div>
      <EmbedWaveform url={current.waveformUrl} progress={total > 0 ? elapsed / total : 0} onSeek={(fraction) => { if (!active) toggle(current); else seek(fraction * total); }} />
      {tracks.length > 1 ? (
        <ol className="min-h-0 flex-1 overflow-y-auto text-sm">
          {tracks.map((track, index) => (
            <li key={track.id}>
              <button type="button" onClick={() => toggle(track)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-900 ${currentTrack?.id === track.id ? "text-cyan-400" : ""}`}>
                <span className="w-5 text-right text-xs text-zinc-400">{index + 1}</span>
                <span className="flex-1 truncate">{track.title}</span>
                <span className="text-xs text-zinc-400">{formatDuration(track.duration)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-400 hover:text-zinc-300">Listen on the app</a>
    </div>
  );
}
