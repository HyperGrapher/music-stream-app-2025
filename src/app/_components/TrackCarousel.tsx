import type { PlayerTrack } from "@/types/player-track";

import type { ContextMeta } from "@/store/player";

import { Carousel } from "./Carousel";
import { TrackCard } from "./TrackCard";

/** A carousel of playable track cards that queue themselves as a list. Renders nothing when empty. */
export function TrackCarousel({ id, title, href, tracks, context }: { id: string; title: string; href?: string; tracks: PlayerTrack[]; context: ContextMeta }) {
  if (tracks.length === 0) return null;
  return (
    <Carousel id={id} title={title} href={href}>
      {tracks.map((track) => <TrackCard key={track.id} track={track} playlist={tracks} context={context} />)}
    </Carousel>
  );
}
