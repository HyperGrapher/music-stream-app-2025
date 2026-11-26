import type { PlayerTrack } from "@/types/player-track";

import type { ContextMeta } from "@/store/player";

import { TrackCard } from "./TrackCard";

type GridTrack = PlayerTrack & { user?: { name: string; image?: string | null } };

/** Responsive grid of playable cards; every card plays within this list as its queue. */
export function TrackGrid({ tracks, context }: { tracks: GridTrack[]; context?: ContextMeta }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tracks.map((track) => (
        <TrackCard key={track.id} track={track} playlist={tracks} context={context} />
      ))}
    </div>
  );
}
