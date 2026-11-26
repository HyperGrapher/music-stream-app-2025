"use client";

import { ArrowDown, ArrowUp, Minus, Pause, Play } from "lucide-react";
import Link from "next/link";

import { TrackMenu } from "@/components/player/TrackMenu";
import { Button } from "@/components/ui/button";
import { formatCount, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

function RankChange({ change }: { change: number | null }) {
  if (change === null) return <span className="text-[10px] font-bold text-orange-300" data-testid="rank-change">NEW</span>;
  if (change === 0) return <span className="text-[10px] text-zinc-400" data-testid="rank-change"><Minus className="inline h-3 w-3" aria-hidden /><span className="sr-only">No change</span></span>;
  return (
    <span className={`flex items-center text-[10px] font-semibold ${change > 0 ? "text-green-400" : "text-red-400"}`} data-testid="rank-change">
      {change > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}{Math.abs(change)}<span className="sr-only">{change > 0 ? " places up" : " places down"}</span>
    </span>
  );
}

/** Chart rows (CH-2): rank, artwork, title, creator, plays this week, play button; "Play all" queues the chart. */
export function ChartList({ entries, name }: { entries: { rank: number; plays: number; change?: number | null; track: PlayerTrack }[]; name: string }) {
  const playContext = usePlayerStore((s) => s.playContext);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const current = usePlayerStore((s) => s.currentTrack?.id);
  const playing = usePlayerStore((s) => s.status === "playing");
  const tracks = entries.map((e) => e.track);
  const meta = { name, source: "CHARTS" as const };
  if (entries.length === 0) return <p className="rounded border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-400">Nothing is charting yet. Play something!</p>;
  return (
    <div>
      <Button className="mb-4 rounded-full bg-orange-700 text-white hover:bg-orange-800" onClick={() => tracks[0] && playContext(tracks, tracks[0], meta)}><Play className="h-4 w-4 fill-current" /> Play all</Button>
      <ol>
        {entries.map(({ rank, plays, change, track }) => (
          <li key={track.id} className="flex items-center gap-3 border-b border-zinc-900 py-2.5" data-testid="chart-row">
            <span className="flex w-10 flex-col items-center">
              <span className="text-lg leading-tight font-bold text-zinc-400">{rank}</span>
              {change === undefined ? null : <RankChange change={change} />}
            </span>
            <img src={track.artworkUrl ?? "/placeholder-track.jpg"} alt="" className="h-12 w-12 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <Link href={track.permalink ?? "#"} className="block truncate font-semibold hover:text-orange-400">{track.title}</Link>
              <Link href={track.user?.username ? `/${track.user.username}` : "#"} className="block truncate text-sm text-zinc-400 hover:text-white">{track.user?.name}</Link>
            </div>
            <span className="hidden text-xs text-zinc-400 sm:block">{formatCount(plays)} plays · {formatDuration(track.duration)}</span>
            <button type="button" aria-label={current === track.id && playing ? `Pause ${track.title}` : `Play ${track.title}`} onClick={() => (current === track.id ? togglePlay() : playContext(tracks, track, meta))} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-orange-500 hover:text-white">
              {current === track.id && playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </button>
            <TrackMenu track={track} />
          </li>
        ))}
      </ol>
    </div>
  );
}
