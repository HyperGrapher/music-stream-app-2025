"use client";

import { useMemo } from "react";

import { useTrackWaveform } from "@/hooks/useTrackWaveform";

const BARS = 90;

/** A compact clickable waveform for the embed player: bars up to the playhead are orange; clicking seeks. */
export function EmbedWaveform({ url, progress, onSeek }: { url: string | null | undefined; progress: number; onSeek: (fraction: number) => void }) {
  const { peaks } = useTrackWaveform(url);
  const bars = useMemo(() => {
    if (peaks.length === 0) return [];
    const size = peaks.length / BARS;
    return Array.from({ length: BARS }, (_, i) => {
      let peak = 0;
      for (let j = Math.floor(i * size); j < Math.min(peaks.length, Math.ceil((i + 1) * size)); j++) peak = Math.max(peak, Math.abs(peaks[j]!.min), Math.abs(peaks[j]!.max));
      return Math.max(0.06, Math.min(1, peak));
    });
  }, [peaks]);
  if (bars.length === 0) return null;
  return (
    <div
      aria-hidden
      data-testid="embed-waveform"
      className="flex h-10 cursor-pointer items-center gap-px"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onSeek(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
      }}
    >
      {bars.map((height, i) => (
        <span key={i} className={`w-full rounded-sm ${i / BARS < progress ? "bg-orange-500" : "bg-zinc-600"}`} style={{ height: `${height * 100}%` }} />
      ))}
    </div>
  );
}
