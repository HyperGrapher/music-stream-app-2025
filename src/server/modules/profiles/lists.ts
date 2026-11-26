import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, RELEASE_TYPES, toCollectionDto } from "@/server/modules/collections/dto";
import { likedByMeSelect, toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { visibleSpotlightCount } from "@/server/modules/plans/entitlements";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

/** Page size of every profile list (PRD PR-3). */
export const PROFILE_PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  /** Opaque: pass back as `cursor` for the next page; null when there is none. */
  nextCursor: string | null;
}

/** Offset cursors over a fully deterministic ordering (every order-by ends in a unique id). */
const offsetOf = (cursor: string | undefined) => {
  const n = Number(cursor ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
function pageOf<T>(rows: T[], offset: number, size: number): Page<T> {
  const hasMore = rows.length > size;
  return { items: hasMore ? rows.slice(0, size) : rows, nextCursor: hasMore ? String(offset + size) : null };
}

type Db = PrismaClient;
interface Ctx { db: Db; viewerId: string | null; now?: Date }

/** Own public tracks: newest (by first publication) or most played. */
export async function trackPage({ db, viewerId, now = clockNow() }: Ctx, creatorId: string, sort: "latest" | "popular", cursor?: string): Promise<Page<ReturnType<typeof toTrackDto>>> {
  const offset = offsetOf(cursor);
  const rows = await db.track.findMany({
    where: { AND: [publicTrackWhere(now), { creatorId }] },
    orderBy:
      sort === "popular"
        ? [{ playCount: "desc" }, { likeCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }]
        : [{ publishedAt: "desc" }, { id: "asc" }],
    skip: offset,
    take: PROFILE_PAGE_SIZE + 1,
    select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) },
  });
  return pageOf(rows.map((row) => toTrackDto(row, { viewerId })), offset, PROFILE_PAGE_SIZE);
}

/** Public collections: `albums` = release types by release date, `sets` = playlists, newest first. */
export async function collectionPage({ db }: Ctx, ownerId: string, kind: "albums" | "sets", cursor?: string) {
  const offset = offsetOf(cursor);
  const rows = await db.collection.findMany({
    where: {
      AND: [publicCollectionWhere(), { ownerId }, kind === "albums" ? { type: { in: [...RELEASE_TYPES] } } : { type: "PLAYLIST" as const }],
    },
    orderBy: kind === "albums" ? [{ releaseDate: "desc" }, { publishedAt: "desc" }, { id: "asc" }] : [{ publishedAt: "desc" }, { id: "asc" }],
    skip: offset,
    take: PROFILE_PAGE_SIZE + 1,
    select: collectionDtoSelect,
  });
  return pageOf(rows.map((row) => toCollectionDto(row)), offset, PROFILE_PAGE_SIZE);
}

const activitySelect = {
  id: true,
  type: true,
  createdAt: true,
  track: { select: { ...trackDtoSelect } },
  collection: { select: collectionDtoSelect },
} satisfies Prisma.ActivitySelect;

export type ActivityItem =
  | { id: string; kind: "track"; reposted: boolean; createdAt: Date; track: ReturnType<typeof toTrackDto> }
  | { id: string; kind: "collection"; reposted: boolean; createdAt: Date; collection: ReturnType<typeof toCollectionDto> };

/**
 * The profile "All" tab and the "Reposts" tab (PR-1): the user's activity, newest first: tracks and
 * collections they published (at publication time) and things they reposted (at repost time). Targets
 * that are not effectively public are skipped.
 */
export async function activityPage(
  { db, viewerId, now = clockNow() }: Ctx,
  actorId: string,
  mode: "all" | "reposts",
  cursor?: string,
): Promise<Page<ActivityItem>> {
  const offset = offsetOf(cursor);
  const rows = await db.activity.findMany({
    where: {
      actorId,
      createdAt: { lte: now },
      type: mode === "reposts" ? { in: ["TRACK_REPOSTED", "COLLECTION_REPOSTED"] } : undefined,
      OR: [{ track: publicTrackWhere(now) }, { collection: publicCollectionWhere() }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: offset,
    take: PROFILE_PAGE_SIZE + 1,
    select: activitySelect,
  });
  const liked = viewerId
    ? new Set((await db.trackLike.findMany({ where: { userId: viewerId, trackId: { in: rows.flatMap((r) => (r.track ? [r.track.id] : [])) } }, select: { trackId: true } })).map((l) => l.trackId))
    : new Set<string>();
  const items = rows.flatMap<ActivityItem>((row) => {
    const reposted = row.type === "TRACK_REPOSTED" || row.type === "COLLECTION_REPOSTED";
    if (row.track) {
      return [{ id: row.id, kind: "track", reposted, createdAt: row.createdAt, track: toTrackDto({ ...row.track, likes: liked.has(row.track.id) ? [{ userId: viewerId! }] : [] }, { viewerId }) }];
    }
    return row.collection ? [{ id: row.id, kind: "collection", reposted, createdAt: row.createdAt, collection: toCollectionDto(row.collection) }] : [];
  });
  return pageOf(items, offset, PROFILE_PAGE_SIZE);
}

/** LK-4: the public Likes list (tracks and collections, newest like first), unless the user hides it. */
export async function likesPage({ db, viewerId, now = clockNow() }: Ctx, userId: string, cursor?: string) {
  const offset = offsetOf(cursor);
  const take = offset + PROFILE_PAGE_SIZE + 1;
  const [tracks, collections] = await Promise.all([
    db.trackLike.findMany({
      where: { userId, track: publicTrackWhere(now) },
      orderBy: [{ createdAt: "desc" }, { trackId: "asc" }],
      take,
      select: { createdAt: true, track: { select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) } } },
    }),
    db.collectionLike.findMany({
      where: { userId, collection: publicCollectionWhere() },
      orderBy: [{ createdAt: "desc" }, { collectionId: "asc" }],
      take,
      select: { createdAt: true, collection: { select: collectionDtoSelect } },
    }),
  ]);
  const merged = [
    ...tracks.map((like) => ({ kind: "track" as const, at: like.createdAt, track: toTrackDto(like.track, { viewerId }) })),
    ...collections.map((like) => ({ kind: "collection" as const, at: like.createdAt, collection: toCollectionDto(like.collection) })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return pageOf(merged.slice(offset, offset + PROFILE_PAGE_SIZE + 1), offset, PROFILE_PAGE_SIZE);
}

const userCardSelect = {
  id: true, name: true, username: true, image: true, verified: true, followerCount: true, publicTrackCount: true,
  avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
} satisfies Prisma.UserSelect;

/** FO-3: followers or followings of a user as cards, newest follow first, with "do I follow them". */
export async function followPage(
  { db, viewerId }: Ctx,
  userId: string,
  direction: "followers" | "following",
  cursor?: string,
  filter?: string,
) {
  const offset = offsetOf(cursor);
  const q = filter?.trim();
  const other = direction === "followers" ? "follower" : "following";
  const rows = await db.follow.findMany({
    where: {
      ...(direction === "followers" ? { followingId: userId } : { followerId: userId }),
      [other]: {
        status: "ACTIVE",
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { username: { contains: q.toLowerCase() } }] } : {}),
      },
    },
    orderBy: [{ createdAt: "desc" }, { followerId: "asc" }, { followingId: "asc" }],
    skip: offset,
    take: PROFILE_PAGE_SIZE + 1,
    select: { follower: { select: userCardSelect }, following: { select: userCardSelect } },
  });
  const users = rows.map((row) => (direction === "followers" ? row.follower : row.following));
  const mine = viewerId
    ? new Set((await db.follow.findMany({ where: { followerId: viewerId, followingId: { in: users.map((u) => u.id) } }, select: { followingId: true } })).map((f) => f.followingId))
    : new Set<string>();
  return pageOf(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      image: userAvatarUrl(user),
      verified: user.verified,
      followerCount: user.followerCount,
      trackCount: user.publicTrackCount,
      followedByMe: mine.has(user.id),
    })),
    offset,
    PROFILE_PAGE_SIZE,
  );
}

/** Spotlight items (SP-1/SP-2) the visitor may see, limited to what the owner's plan allows (PL-3). */
export async function spotlight({ db, viewerId, now = clockNow() }: Ctx, userId: string, plan: "FREE" | "PRO") {
  const rows = await db.spotlightItem.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    take: visibleSpotlightCount({ plan }),
    select: {
      position: true,
      track: { select: { ...trackDtoSelect, ...likedByMeSelect(viewerId), moderationState: true, visibility: true, publishAt: true } },
      collection: { select: collectionDtoSelect },
    },
  });
  const publicTracks = new Set(
    (await db.track.findMany({ where: { AND: [publicTrackWhere(now), { id: { in: rows.flatMap((r) => (r.track ? [r.track.id] : [])) } }] }, select: { id: true } })).map((t) => t.id),
  );
  const publicCollections = new Set(
    (await db.collection.findMany({ where: { AND: [publicCollectionWhere(), { id: { in: rows.flatMap((r) => (r.collection ? [r.collection.id] : [])) } }] }, select: { id: true } })).map((c) => c.id),
  );
  type SpotlightEntry =
    | { kind: "track"; track: ReturnType<typeof toTrackDto> }
    | { kind: "collection"; collection: ReturnType<typeof toCollectionDto> };
  return rows.flatMap<SpotlightEntry>((row) => {
    if (row.track && publicTracks.has(row.track.id)) return [{ kind: "track", track: toTrackDto(row.track, { viewerId }) }];
    if (row.collection && publicCollections.has(row.collection.id)) return [{ kind: "collection", collection: toCollectionDto(row.collection) }];
    return [];
  });
}
