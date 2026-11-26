import { notFound } from "next/navigation";

import { now } from "@/server/clock";
import { db } from "@/server/db";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { isTrackId } from "@/server/modules/tracks/access";
import { toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { collectionAccess, collectionAccessSelect, trackAccess, trackAccessSelect } from "@/server/modules/visibility";

import { EmbedPlayer } from "../../EmbedPlayer";

/** `/embed/set/{id}`: the framed player for an album or playlist. Tracks the visitor cannot play are left out. */
export default async function EmbedSetPage({ params, searchParams }: { params: Promise<{ collectionId: string }>; searchParams: Promise<{ s?: string }> }) {
  const [{ collectionId }, { s }] = await Promise.all([params, searchParams]);
  if (!isTrackId(collectionId)) notFound();
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: {
      ...collectionAccessSelect,
      ...collectionDtoSelect,
      tracks: { orderBy: { position: "asc" }, select: { track: { select: { ...trackAccessSelect, ...trackDtoSelect, embeddable: true } } } },
    },
  });
  const access = collection && collectionAccess(collection, { secret: s });
  if (!collection || !access) notFound();
  const via = access === "secret" ? { row: collection, secret: s } : null;
  const at = now();
  const tracks = collection.tracks.flatMap(({ track }) => {
    const grant = trackAccess(track, { now: at, viaCollection: via });
    return grant && track.embeddable ? [toTrackDto(track, { access: grant === "secret" && via ? { secret: s, collectionId: collection.id } : undefined })] : [];
  });
  const dto = toCollectionDto(collection, { secret: access === "secret" ? s : null });
  return <EmbedPlayer tracks={tracks} title={dto.title} href={dto.permalink} collectionId={collection.id} />;
}
