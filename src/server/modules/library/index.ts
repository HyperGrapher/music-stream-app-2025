import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, RELEASE_TYPES, toCollectionDto } from "@/server/modules/collections/dto";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

export const LIBRARY_PAGE_SIZE = 24;
export const HISTORY_LIMIT = 200;

/**
 * Your collections for LB-3 / LB-4: `playlists` (type PLAYLIST) or `albums` (release types), created by you
 * (any visibility) and/or liked by you (only while still public, LB-7). Newest first by when it was created / liked.
 */
export async function libraryCollections(
  db: PrismaClient,
  userId: string,
  { kind, filter = "all", offset = 0 }: { kind: "playlists" | "albums"; filter?: "all" | "created" | "liked"; offset?: number },
) {
  const types = kind === "albums" ? { in: [...RELEASE_TYPES] } : { equals: "PLAYLIST" as const };
  const take = offset + LIBRARY_PAGE_SIZE + 1;
  const [created, liked] = await Promise.all([
    filter === "liked"
      ? []
      : db.collection.findMany({ where: { ownerId: userId, type: types }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take, select: { ...collectionDtoSelect, secretToken: true } }),
    filter === "created"
      ? []
      : db.collectionLike.findMany({ where: { userId, collection: { AND: [publicCollectionWhere(), { type: types }] } }, orderBy: [{ createdAt: "desc" }, { collectionId: "asc" }], take, select: { createdAt: true, collection: { select: collectionDtoSelect } } }),
  ]);
  const merged = [
    ...created.map(({ secretToken: _unused, ...row }) => ({ at: row.createdAt, origin: "created" as const, collection: toCollectionDto(row) })),
    ...liked.map((like) => ({ at: like.createdAt, origin: "liked" as const, collection: toCollectionDto(like.collection) })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .filter((entry, index, all) => all.findIndex((e) => e.collection.id === entry.collection.id) === index);
  const page = merged.slice(offset, offset + LIBRARY_PAGE_SIZE + 1);
  const hasMore = page.length > LIBRARY_PAGE_SIZE;
  return { items: page.slice(0, LIBRARY_PAGE_SIZE).map((e) => ({ origin: e.origin, ...e.collection })), nextOffset: hasMore ? offset + LIBRARY_PAGE_SIZE : null };
}

/**
 * LB-6: the last 200 distinct tracks you played, newest first, hidden by "Clear listening history"
 * (`historyClearedAt`). Tracks that are no longer public disappear (LB-7); play events stay for counts.
 */
export async function listeningHistory(db: PrismaClient, userId: string, { limit = HISTORY_LIMIT, now = clockNow() }: { limit?: number; now?: Date } = {}) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { historyClearedAt: true } });
  const events = await db.playEvent.findMany({
    where: { listenerId: userId, ...(user.historyClearedAt ? { createdAt: { gt: user.historyClearedAt } } : {}), track: publicTrackWhere(now) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    distinct: ["trackId"],
    take: Math.min(limit, HISTORY_LIMIT),
    select: { createdAt: true, track: { select: { ...trackDtoSelect, ...likedByMeSelect(userId) } } },
  });
  return events.map((event) => ({ playedAt: event.createdAt, track: toTrackDto(event.track, { viewerId: userId }) }));
}

export async function clearHistory(db: PrismaClient, userId: string, now = clockNow()) {
  await db.user.update({ where: { id: userId }, data: { historyClearedAt: now } });
  return { clearedAt: now };
}
