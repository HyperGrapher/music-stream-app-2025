"use client";

import { Play, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

/** Play all / Shuffle for the Likes list (LB-2). */
export function LikesActions({ tracks }: { tracks: PlayerTrack[] }) {
  const playContext = usePlayerStore((s) => s.playContext);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  if (tracks.length === 0) return null;
  const meta = { name: "Your likes", source: "LIBRARY" as const };
  return (
    <div className="mb-4 flex gap-2">
      <Button className="rounded-full bg-orange-500 text-white hover:bg-orange-600" onClick={() => playContext(tracks, tracks[0]!, meta)}><Play className="h-4 w-4 fill-current" /> Play all</Button>
      <Button variant="outline" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => { playContext(tracks, tracks[Math.floor(Math.random() * tracks.length)]!, meta); if (!usePlayerStore.getState().shuffle) toggleShuffle(); }}><Shuffle className="h-4 w-4" /> Shuffle</Button>
    </div>
  );
}
