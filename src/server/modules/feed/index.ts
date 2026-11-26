import type { ActivityType, Prisma, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { likedByMeSelect, toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

export const FEED_TABS = {
  all: null,
  tracks: ["TRACK_POSTED", "TRACK_REPOSTED"],
  sets: ["COLLECTION_POSTED", "COLLECTION_REPOSTED"],
  reposts: ["TRACK_REPOSTED", "COLLECTION_REPOSTED"],
} as const satisfies Record<string, readonly ActivityType[] | null>;
export type FeedTab = keyof typeof FEED_TABS;

const RAW_PAGE = 60;
const actorSelect = { select: { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } } } as const;

export interface FeedCursor { createdAt: Date; id: string }

/**
 * The viewer's feed (FD-1..FD-5): activity of the people they follow, newest first, only for targets
 * that are public right now and not by blocked users. The same target appears once per page window;
 * several reposters collapse into one item ("A, B and 3 others reposted", FD-3).
 */
export async function listFeed(
  db: PrismaClient,
  viewerId: string,
  { tab = "all", cursor, limit = 20, now = clockNow() }: { tab?: FeedTab; cursor?: FeedCursor; limit?: number; now?: Date } = {},
) {
  const types = FEED_TABS[tab];
  const where: Prisma.ActivityWhereInput = {
    actor: { status: "ACTIVE", followers: { some: { followerId: viewerId } }, blockedBy: { none: { blockerId: viewerId } }, blocking: { none: { blockedId: viewerId } } },
    createdAt: { lte: now },
    ...(types ? { type: { in: [...types] } } : {}),
    AND: [
      { OR: [{ track: publicTrackWhere(now) }, { collection: publicCollectionWhere() }] },
      ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] }] : []),
    ],
  };
  const rows = await db.activity.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: RAW_PAGE,
    select: {
      id: true,
      type: true,
      createdAt: true,
      actor: actorSelect,
      track: { select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) } },
      collection: { select: collectionDtoSelect },
    },
  });

  const byTarget = new Map<string, { id: string; at: Date; reposted: boolean; actors: { id: string; name: string; username: string; image: string | null }[]; actorCount: number; track: (typeof rows)[number]["track"]; collection: (typeof rows)[number]["collection"] }>();
  for (const row of rows) {
    const key = row.track ? `t:${row.track.id}` : row.collection ? `c:${row.collection.id}` : row.id;
    const actor = { id: row.actor.id, name: row.actor.name, username: row.actor.username, image: userAvatarUrl(row.actor) };
    const reposted = row.type === "TRACK_REPOSTED" || row.type === "COLLECTION_REPOSTED";
    const existing = byTarget.get(key);
    if (!existing) {
      byTarget.set(key, { id: row.id, at: row.createdAt, reposted, actors: [actor], actorCount: 1, track: row.track, collection: row.collection });
    } else if (!existing.actors.some((a) => a.id === actor.id)) {
      existing.actorCount += 1;
      if (existing.actors.length < 3) existing.actors.push(actor);
    }
  }

  const page = [...byTarget.values()].slice(0, limit);
  // RP-1: the first reposter's caption (P2) travels with the item.
  const reposts = page.filter((e) => e.reposted && e.actors[0]);
  const [trackCaptions, collectionCaptions] = reposts.length
    ? await Promise.all([
        db.trackRepost.findMany({ where: { caption: { not: null }, userId: { in: reposts.flatMap((e) => (e.track ? [e.actors[0]!.id] : [])) }, trackId: { in: reposts.flatMap((e) => (e.track ? [e.track.id] : [])) } }, select: { userId: true, trackId: true, caption: true } }),
        db.collectionRepost.findMany({ where: { caption: { not: null }, userId: { in: reposts.flatMap((e) => (e.collection ? [e.actors[0]!.id] : [])) }, collectionId: { in: reposts.flatMap((e) => (e.collection ? [e.collection.id] : [])) } }, select: { userId: true, collectionId: true, caption: true } }),
      ])
    : [[], []];
  const captionOf = (entry: (typeof page)[number]) => {
    const actor = entry.actors[0]?.id;
    if (!entry.reposted || !actor) return null;
    return (entry.track ? trackCaptions.find((c) => c.userId === actor && c.trackId === entry.track!.id)?.caption : collectionCaptions.find((c) => c.userId === actor && c.collectionId === entry.collection?.id)?.caption) ?? null;
  };

  const items = page.map((entry) => ({
    caption: captionOf(entry),
    id: entry.id,
    at: entry.at,
    verb: entry.reposted ? ("reposted" as const) : ("posted" as const),
    actors: entry.actors,
    actorCount: entry.actorCount,
    track: entry.track ? toTrackDto(entry.track, { viewerId }) : null,
    collection: entry.collection ? { ...toCollectionDto(entry.collection) } : null,
  }));
  const lastRaw = rows.at(-1);
  const exhausted = rows.length < RAW_PAGE && byTarget.size <= limit;
  return { items, nextCursor: exhausted || !lastRaw ? null : { createdAt: lastRaw.createdAt, id: lastRaw.id } };
}

/** How many feed items are newer than `since` (the "New posts" pill, FD-5). */
export async function newFeedCount(db: PrismaClient, viewerId: string, since: Date, now = clockNow()) {
  return db.activity.count({
    where: {
      actor: { status: "ACTIVE", followers: { some: { followerId: viewerId } } },
      createdAt: { gt: since, lte: now },
      OR: [{ track: publicTrackWhere(now) }, { collection: publicCollectionWhere() }],
    },
  });
}
