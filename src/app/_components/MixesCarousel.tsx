"use client";

import { Pause, Play } from "lucide-react";

import { genreLabel } from "@/lib/genres";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

import { Carousel } from "./Carousel";

interface Mix { genre: string; tracks: PlayerTrack[] }

/** "Your mixes" (P2): a card per favourite genre; play starts that generated queue. Renders nothing without mixes. */
export function MixesCarousel({ mixes }: { mixes: Mix[] }) {
  const playContext = usePlayerStore((s) => s.playContext);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const context = usePlayerStore((s) => s.contextName);
  const playing = usePlayerStore((s) => s.status === "playing");
  if (mixes.length === 0) return null;
  return (
    <Carousel id="your-mixes" title="Your mixes">
      {mixes.map((mix) => {
        const name = `Your ${genreLabel(mix.genre)} mix`;
        const active = context === name;
        const art = mix.tracks.filter((t) => t.artworkUrl).slice(0, 4);
        return (
          <article key={mix.genre} className="group">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-800">
              <div className={`grid h-full w-full ${art.length > 1 ? "grid-cols-2 grid-rows-2" : ""}`}>
                {art.map((t) => (
                   
                  <img key={t.id} src={t.artworkUrl!} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <button
                type="button"
                aria-label={active && playing ? `Pause ${name}` : `Play ${name}`}
                onClick={() => (active ? togglePlay() : playContext(mix.tracks, mix.tracks[0]!, { name, source: "HOME" }))}
                className="absolute right-2 bottom-2 flex h-10 w-10 items-center justify-center rounded-full bg-orange-700 text-white shadow-lg hover:bg-orange-600"
              >
                {active && playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
              </button>
            </div>
            <h3 className="mt-2 truncate text-sm font-semibold text-white">{name}</h3>
            <p className="truncate text-xs text-zinc-400">{mix.tracks.length} tracks</p>
          </article>
        );
      })}
    </Carousel>
  );
}
