import { notFound } from "next/navigation";

import { now } from "@/server/clock";
import { db } from "@/server/db";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import { toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { trackAccessSelect } from "@/server/modules/visibility";

import { EmbedPlayer } from "../../EmbedPlayer";

/** `/embed/track/{id}`: the framed player. Public tracks, or hidden ones with their secret (`?s=`); creators can switch embedding off. */
export default async function EmbedTrackPage({ params, searchParams }: { params: Promise<{ trackId: string }>; searchParams: Promise<{ s?: string }> }) {
  const [{ trackId }, { s }] = await Promise.all([params, searchParams]);
  if (!isTrackId(trackId)) notFound();
  const row = await db.track.findUnique({ where: { id: trackId }, select: { ...trackAccessSelect, ...trackDtoSelect, embeddable: true } });
  const access = { ...accessParamsFromUrl(`http://local/?s=${encodeURIComponent(s ?? "")}`), viewerId: null };
  if (!row?.embeddable || !(await authorizeTrack(db, row, access, now()))) notFound();
  const track = toTrackDto(row, { access: s ? { secret: s } : undefined });
  return <EmbedPlayer tracks={[track]} title={track.title} href={track.permalink} />;
}
