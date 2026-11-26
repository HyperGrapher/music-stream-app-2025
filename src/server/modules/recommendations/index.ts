import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { publicTrackWhere } from "@/server/modules/visibility";

import { buildTaste, diversify, hasSignal, rank, topKeys, type Candidate, type Taste } from "./scoring";

const DAY_MS = 86_400_000;
const CACHE_MS = 10 * 60_000;
const profileCache = new Map<string, { at: number; value: Profile }>();

interface Profile {
  taste: Taste;
  /** Never recommend these: own, liked, reposted, played in the last 7 days. */
  exclude: Set<string>;
  likedIds: string[];
  favouriteGenres: string[];
  blocked: Set<string>;
}

/**
 * RC-1: weights over genres and tags from likes (x3), reposts (x3), completed plays in 90 days (x1), playlist adds (x2),
 * onboarding favourite genres (x2) plus followed creators. Computed on request, cached 10 minutes per user.
 */
export async function tasteProfile(db: PrismaClient, userId: string, now = clockNow()): Promise<Profile> {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const pick = { select: { genre: true, tags: true } } as const;
  const [user, likes, reposts, plays, adds, recent, follows, blocks, own] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { favoriteGenres: true } }),
    db.trackLike.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 300, select: { trackId: true, track: pick } }),
    db.trackRepost.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { trackId: true, track: pick } }),
    db.playEvent.findMany({ where: { listenerId: userId, completed: true, createdAt: { gte: since90 } }, orderBy: { createdAt: "desc" }, take: 300, select: { track: pick } }),
    db.collectionTrack.findMany({ where: { addedById: userId, collection: { type: "PLAYLIST" } }, orderBy: { addedAt: "desc" }, take: 200, select: { track: pick } }),
    db.playEvent.findMany({ where: { listenerId: userId, createdAt: { gte: since7 } }, select: { trackId: true }, take: 500 }),
    db.follow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 2000 }),
    db.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } }),
    db.track.findMany({ where: { creatorId: userId }, select: { id: true }, take: 1000 }),
  ]);
  const signals = [
    ...likes.map((l) => ({ ...l.track, weight: 3 })),
    ...reposts.map((r) => ({ ...r.track, weight: 3 })),
    ...plays.map((p) => ({ ...p.track, weight: 1 })),
    ...adds.map((a) => ({ ...a.track, weight: 2 })),
    ...user.favoriteGenres.map((genre) => ({ genre, tags: [] as string[], weight: 2 })),
  ];
  const value: Profile = {
    taste: buildTaste(signals, follows.map((f) => f.followingId)),
    exclude: new Set([...likes.map((l) => l.trackId), ...reposts.map((r) => r.trackId), ...recent.map((p) => p.trackId), ...own.map((t) => t.id)]),
    likedIds: likes.map((l) => l.trackId),
    favouriteGenres: user.favoriteGenres,
    blocked: new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== userId)),
  };
  profileCache.set(userId, { at: Date.now(), value });
  return value;
}

/** Test helper: forget cached profiles. */
export const clearTasteCache = () => profileCache.clear();

const candidateSelect = { id: true, creatorId: true, genre: true, tags: true, playCount: true, likeCount: true, publishedAt: true, createdAt: true } as const;

/** Trending public tracks (recent plays), optionally within genres: the cold-start answer and the Home "Trending in X" rows. */
export async function trendingTracks(db: PrismaClient, { genres, limit = 12, days = 30, viewerId = null, excludeIds = [], now = clockNow() }: { genres?: string[]; limit?: number; days?: number; viewerId?: string | null; excludeIds?: string[]; now?: Date } = {}) {
  const rows = await db.track.findMany({
    where: { AND: [publicTrackWhere(now), { publishedAt: { gte: new Date(now.getTime() - days * DAY_MS) } }, ...(genres?.length ? [{ genre: { in: genres } }] : []), ...(excludeIds.length ? [{ id: { notIn: excludeIds } }] : [])] },
    orderBy: [{ playCount: "desc" }, { likeCount: "desc" }, { id: "asc" }],
    take: limit * 3,
    select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) },
  });
  return diversify(rows, limit).map((row) => toTrackDto(row, { viewerId }));
}

/**
 * RC-2 "More of what you like": candidates are public tracks of the last 180 days matching the profile's top genres or
 * tags, plus tracks liked by people who liked the same tracks (co-likes). Own, liked, recently played and blocked
 * creators' tracks are excluded; max 2 per creator. Without any signal: trending in the favourite genres.
 */
export async function recommendForUser(db: PrismaClient, userId: string, { limit = 12, now = clockNow() }: { limit?: number; now?: Date } = {}) {
  const profile = await tasteProfile(db, userId, now);
  if (!hasSignal(profile.taste)) return trendingTracks(db, { genres: profile.favouriteGenres, limit, viewerId: userId, now });

  const genres = topKeys(profile.taste.genres, 5);
  const tags = topKeys(profile.taste.tags, 8);
  const since = new Date(now.getTime() - 180 * DAY_MS);

  // Co-likes: people who liked what I liked, and what else they liked (last 1000 likes).
  let coLikedIds: string[] = [];
  if (profile.likedIds.length) {
    const peers = await db.trackLike.findMany({ where: { trackId: { in: profile.likedIds.slice(0, 50) }, userId: { not: userId } }, select: { userId: true }, take: 200 });
    if (peers.length) {
      const likes = await db.trackLike.findMany({ where: { userId: { in: [...new Set(peers.map((p) => p.userId))] } }, orderBy: { createdAt: "desc" }, take: 1000, select: { trackId: true } });
      coLikedIds = [...new Set(likes.map((l) => l.trackId))].filter((id) => !profile.exclude.has(id));
    }
  }

  const rows = await db.track.findMany({
    where: {
      AND: [
        publicTrackWhere(now),
        { publishedAt: { gte: since } },
        { id: { notIn: [...profile.exclude] } },
        { creatorId: { notIn: [...profile.blocked, userId] } },
        { OR: [...(genres.length ? [{ genre: { in: genres } }] : []), ...(tags.length ? [{ tags: { hasSome: tags } }] : []), ...(coLikedIds.length ? [{ id: { in: coLikedIds.slice(0, 300) } }] : [])] },
      ],
    },
    orderBy: [{ playCount: "desc" }, { id: "asc" }],
    take: 300,
    select: { ...candidateSelect },
  });
  const co = new Set(coLikedIds);
  const candidates: (Candidate & { createdAt: Date })[] = rows.map((r) => ({ ...r, publishedAt: r.publishedAt ?? r.createdAt, coLiked: co.has(r.id) }));
  const ranked = diversify(rank(candidates, profile.taste, now), limit);
  if (ranked.length === 0) return trendingTracks(db, { genres: profile.favouriteGenres, limit, viewerId: userId, excludeIds: [...profile.exclude], now });

  const full = await db.track.findMany({ where: { id: { in: ranked.map((r) => r.id) } }, select: { ...trackDtoSelect, ...likedByMeSelect(userId) } });
  const byId = new Map(full.map((t) => [t.id, t]));
  return ranked.flatMap((r) => byId.get(r.id) ?? []).map((row) => toTrackDto(row, { viewerId: userId }));
}

/**
 * DI "Your mixes" (P2): one generated queue per top-3 genre of the listener ("Your Electronic mix"). Tracks are public,
 * from that genre, ranked by the listener's taste profile (liked ones included: a mix is a playlist to listen to, not a
 * discovery list), at most 3 per creator; own and blocked creators' tracks never appear.
 */
export async function yourMixes(db: PrismaClient, userId: string, { size = 25, mixes = 3, now = clockNow() }: { size?: number; mixes?: number; now?: Date } = {}) {
  const profile = await tasteProfile(db, userId, now);
  const genres = (hasSignal(profile.taste) ? topKeys(profile.taste.genres, mixes) : profile.favouriteGenres.slice(0, mixes).map((g) => g.toLowerCase())).slice(0, mixes);
  const result = await Promise.all(
    genres.map(async (genre) => {
      const rows = await db.track.findMany({
        where: { AND: [publicTrackWhere(now), { genre }, { creatorId: { notIn: [...profile.blocked, userId] } }] },
        orderBy: [{ playCount: "desc" }, { id: "asc" }],
        take: 150,
        select: { ...candidateSelect },
      });
      const candidates: Candidate[] = rows.map((r) => ({ ...r, publishedAt: r.publishedAt ?? r.createdAt }));
      // `rank` drops zero scores (brand-new tracks have no popularity yet): keep them at the end instead.
      const ranked = rank(candidates, profile.taste, now);
      const rest = candidates.filter((c) => !ranked.some((r) => r.id === c.id));
      const picked = diversify([...ranked, ...rest], size, 3);
      if (picked.length < 3) return null;
      const full = await db.track.findMany({ where: { id: { in: picked.map((p) => p.id) } }, select: { ...trackDtoSelect, ...likedByMeSelect(userId) } });
      const byId = new Map(full.map((t) => [t.id, t]));
      return { genre, tracks: picked.flatMap((p) => byId.get(p.id) ?? []).map((row) => toTrackDto(row, { viewerId: userId })) };
    }),
  );
  return result.flatMap((m) => (m ? [m] : []));
}
