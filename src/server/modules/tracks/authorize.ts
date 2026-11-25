import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import {
  collectionAccessSelect,
  trackAccess,
  type TrackAccess,
  type TrackAccessRow,
} from "@/server/modules/visibility";

import type { AccessParams } from "./access";

/**
 * Decides whether a viewer may see a loaded track, honouring track secret links (`?s=`) and
 * collection secret links (`?c=<collectionId>&s=`). Used by every route handler and tRPC
 * procedure that exposes a track; callers answer 404 (never 403) when this returns null.
 *
 * `track` must contain the columns of `trackAccessSelect` plus `id`.
 */
export async function authorizeTrack(
  db: Pick<PrismaClient, "collection">,
  track: TrackAccessRow & { id: string },
  { viewerId, secret, collectionId }: AccessParams & { viewerId?: string | null },
  now: Date = clockNow(),
): Promise<TrackAccess | null> {
  if (collectionId && secret) {
    const collection = await db.collection.findFirst({
      where: { id: collectionId, tracks: { some: { trackId: track.id } } },
      select: collectionAccessSelect,
    });
    return trackAccess(track, {
      viewerId,
      now,
      viaCollection: collection ? { row: collection, secret } : null,
    });
  }
  return trackAccess(track, { viewerId, now, secret });
}
