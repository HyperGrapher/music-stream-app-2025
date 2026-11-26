import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, RELEASE_TYPES, toCollectionDto } from "@/server/modules/collections/dto";
import { blockedEitherWay } from "@/server/modules/social/blocks";
import { likedByMeSelect, toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

export const SEARCH_PAGE_SIZE = 20;
const CANDIDATES = 400;

/** Added-within filter of the track search (SE-3). */
export const ADDED_WINDOWS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 } as const;
export const DURATION_BUCKETS = { short: [0, 120], medium: [120, 600], long: [600, 1800], epic: [1800, 24 * 3600] } as const;
/** License families (SE-3): which Creative Commons licenses allow what. */
export const LICENSE_USES = {
  share: ["CC0", "CC_BY", "CC_BY_SA", "CC_BY_ND", "CC_BY_NC", "CC_BY_NC_SA", "CC_BY_NC_ND"],
  commercial: ["CC0", "CC_BY", "CC_BY_SA", "CC_BY_ND"],
  modify: ["CC0", "CC_BY", "CC_BY_SA"],
} as const;

export interface TrackFilters {
  genre?: string;
  duration?: keyof typeof DURATION_BUCKETS;
  added?: keyof typeof ADDED_WINDOWS;
  license?: keyof typeof LICENSE_USES;
}

/** Cleans user input for tsquery/ILIKE use; returns null when nothing searchable remains. */
export function normaliseQuery(raw: string): string | null {
  const q = raw.replace(/\s+/g, " ").trim().slice(0, 100);
  return q.length >= 1 ? q : null;
}

/** `#tag` searches are tag searches (SE-4). */
export function tagOfQuery(raw: string): string | null {
  const match = /^#([\p{L}\p{N}_-]{1,40})$/u.exec(raw.trim());
  return match ? match[1]!.toLowerCase() : null;
}

const likeEscape = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Ranked candidate ids for tracks: FTS rank + trigram similarity + prefix bonus, boosted by popularity and recency. */
async function trackIds(db: PrismaClient, q: string, filters: TrackFilters, now: Date) {
  const like = `${likeEscape(q)}%`;
  const range = filters.duration ? DURATION_BUCKETS[filters.duration] : null;
  const since = filters.added ? new Date(now.getTime() - ADDED_WINDOWS[filters.added]) : null;
  const licenses = filters.license ? [...LICENSE_USES[filters.license]] : null;
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH query AS (SELECT websearch_to_tsquery('simple', ${q}) AS tsq),
    matched_creators AS (
      SELECT u.id FROM "user" u
      WHERE u.status = 'ACTIVE' AND (u."username" ILIKE ${like} OR similarity(u."name", ${q}) > 0.45 OR u."name" ILIKE ${like})
      LIMIT 20
    )
    SELECT t.id FROM "track" t, query
    WHERE t."moderationState" = 'VISIBLE'
      AND (t.visibility = 'PUBLIC' OR (t.visibility = 'SCHEDULED' AND t."publishAt" <= ${now}))
      AND (
        ms_track_tsv(t."title", t."artistName", t."genre", t."tags", t."description") @@ query.tsq
        OR t."title" % ${q} OR t."title" ILIKE ${like}
        OR t."creatorId" IN (SELECT id FROM matched_creators)
      )
      ${filters.genre ? Prisma.sql`AND t."genre" = ${filters.genre}` : Prisma.empty}
      ${range ? Prisma.sql`AND t."durationMs" >= ${range[0] * 1000} AND t."durationMs" < ${range[1] * 1000}` : Prisma.empty}
      ${since ? Prisma.sql`AND coalesce(t."publishedAt", t."createdAt") >= ${since}` : Prisma.empty}
      ${licenses ? Prisma.sql`AND t."license"::text = ANY(${licenses})` : Prisma.empty}
    ORDER BY (
        ts_rank_cd(ms_track_tsv(t."title", t."artistName", t."genre", t."tags", t."description"), query.tsq, 32)
        + 0.8 * similarity(t."title", ${q})
        + CASE WHEN t."title" ILIKE ${like} THEN 0.5 ELSE 0 END
        + CASE WHEN t."creatorId" IN (SELECT id FROM matched_creators) THEN 0.3 ELSE 0 END
      ) * ln(t."playCount" + t."likeCount" + 2)
        / (1 + extract(epoch FROM (${now}::timestamptz - coalesce(t."publishedAt", t."createdAt"))) / 86400 / 365) DESC,
      t.id ASC
    LIMIT ${CANDIDATES}`);
  return rows.map((r) => r.id);
}

async function userIds(db: PrismaClient, q: string) {
  const like = `${likeEscape(q.toLowerCase())}%`;
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH query AS (SELECT websearch_to_tsquery('simple', ${q}) AS tsq)
    SELECT u.id FROM "user" u, query
    WHERE u.status = 'ACTIVE' AND u."onboardedAt" IS NOT NULL
      AND (ms_user_tsv(u."name", u."username", u."bio") @@ query.tsq OR u."name" % ${q} OR u."username" ILIKE ${like} OR u."name" ILIKE ${like})
    ORDER BY (
        ts_rank_cd(ms_user_tsv(u."name", u."username", u."bio"), query.tsq, 32)
        + 0.8 * greatest(similarity(u."name", ${q}), similarity(u."username", ${q}))
        + CASE WHEN u."username" ILIKE ${like} OR u."name" ILIKE ${like} THEN 0.5 ELSE 0 END
      ) * ln(u."followerCount" + 2) DESC, u.id ASC
    LIMIT ${CANDIDATES}`);
  return rows.map((r) => r.id);
}

async function collectionIds(db: PrismaClient, q: string, kind: "albums" | "playlists") {
  const like = `${likeEscape(q)}%`;
  const types = kind === "albums" ? [...RELEASE_TYPES] : ["PLAYLIST"];
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH query AS (SELECT websearch_to_tsquery('simple', ${q}) AS tsq)
    SELECT c.id FROM "collection" c JOIN "user" o ON o.id = c."ownerId", query
    WHERE c."moderationState" = 'VISIBLE' AND c.visibility = 'PUBLIC' AND o.status = 'ACTIVE' AND c."type"::text = ANY(${types})
      AND (ms_track_tsv(c."title", NULL, c."genre", c."tags", c."description") @@ query.tsq OR c."title" % ${q} OR c."title" ILIKE ${like})
    ORDER BY (
        ts_rank_cd(ms_track_tsv(c."title", NULL, c."genre", c."tags", c."description"), query.tsq, 32)
        + 0.8 * similarity(c."title", ${q}) + CASE WHEN c."title" ILIKE ${like} THEN 0.5 ELSE 0 END
      ) * ln(c."playCount" + c."likeCount" + 2) DESC, c.id ASC
    LIMIT ${CANDIDATES}`);
  return rows.map((r) => r.id);
}

const inOrder = <T extends { id: string }>(ids: string[], rows: T[]) => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
};

/**
 * Visibility is re-checked when the rows are loaded (never trust the SQL prefilter alone): only
 * effectively public, visible content ever leaves this module (SE-4).
 */
export async function searchTracks(db: PrismaClient, rawQuery: string, { viewerId = null, filters = {}, offset = 0, limit = SEARCH_PAGE_SIZE, now = clockNow() }: { viewerId?: string | null; filters?: TrackFilters; offset?: number; limit?: number; now?: Date } = {}) {
  const q = normaliseQuery(rawQuery);
  if (!q) return { items: [], nextOffset: null as number | null };
  const ids = await trackIds(db, q, filters, now);
  const window = ids.slice(offset, offset + limit + 1);
  const blocked = await blockedEitherWay(db, viewerId);
  const rows = await db.track.findMany({ where: { AND: [{ id: { in: window } }, publicTrackWhere(now), ...(blocked.size ? [{ creatorId: { notIn: [...blocked] } }] : [])] }, select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) } });
  const items = inOrder(window, rows).slice(0, limit).map((row) => toTrackDto(row, { viewerId }));
  return { items, nextOffset: window.length > limit ? offset + limit : null };
}

export async function searchPeople(db: PrismaClient, rawQuery: string, { viewerId = null, offset = 0, limit = SEARCH_PAGE_SIZE }: { viewerId?: string | null; offset?: number; limit?: number } = {}) {
  const q = normaliseQuery(rawQuery);
  if (!q) return { items: [], nextOffset: null as number | null };
  const ids = await userIds(db, q);
  const window = ids.slice(offset, offset + limit + 1);
  const blocked = await blockedEitherWay(db, viewerId);
  const rows = await db.user.findMany({
    where: { id: { in: window.filter((id) => !blocked.has(id)) }, status: "ACTIVE" },
    select: { id: true, name: true, username: true, image: true, verified: true, followerCount: true, publicTrackCount: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } },
  });
  const mine = viewerId ? new Set((await db.follow.findMany({ where: { followerId: viewerId, followingId: { in: window } }, select: { followingId: true } })).map((f) => f.followingId)) : new Set<string>();
  const items = inOrder(window, rows).slice(0, limit).map((u) => ({ id: u.id, name: u.name, username: u.username, image: userAvatarUrl(u), verified: u.verified, followerCount: u.followerCount, trackCount: u.publicTrackCount, followedByMe: mine.has(u.id) }));
  return { items, nextOffset: window.length > limit ? offset + limit : null };
}

export async function searchCollections(db: PrismaClient, rawQuery: string, kind: "albums" | "playlists", { viewerId = null, offset = 0, limit = SEARCH_PAGE_SIZE }: { viewerId?: string | null; offset?: number; limit?: number } = {}) {
  const q = normaliseQuery(rawQuery);
  if (!q) return { items: [], nextOffset: null as number | null };
  const ids = await collectionIds(db, q, kind);
  const window = ids.slice(offset, offset + limit + 1);
  const blocked = await blockedEitherWay(db, viewerId);
  const rows = await db.collection.findMany({ where: { AND: [{ id: { in: window } }, publicCollectionWhere(), ...(blocked.size ? [{ ownerId: { notIn: [...blocked] } }] : [])] }, select: collectionDtoSelect });
  const items = inOrder(window, rows).slice(0, limit).map((row) => toCollectionDto(row));
  return { items, nextOffset: window.length > limit ? offset + limit : null };
}

/** Navbar autocomplete (SE-1): up to 3 people, 4 tracks, 2 albums, 2 playlists. */
export async function suggest(db: PrismaClient, rawQuery: string, viewerId: string | null = null) {
  const q = normaliseQuery(rawQuery);
  if (!q || q.length < 2) return { people: [], tracks: [], albums: [], playlists: [] };
  const [people, tracks, albums, playlists] = await Promise.all([
    searchPeople(db, q, { viewerId, limit: 3 }),
    searchTracks(db, q, { viewerId, limit: 4 }),
    searchCollections(db, q, "albums", { viewerId, limit: 2 }),
    searchCollections(db, q, "playlists", { viewerId, limit: 2 }),
  ]);
  return { people: people.items, tracks: tracks.items, albums: albums.items, playlists: playlists.items };
}


/**
 * CM-4 `@` autocomplete: usernames starting with what was typed, people you follow first, then everyone else.
 * Blocked people (either way) never show.
 */
export async function mentionSuggestions(db: PrismaClient, viewerId: string, rawQuery: string, limit = 6) {
  const q = rawQuery.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 25);
  const blocked = await blockedEitherWay(db, viewerId);
  const select = { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } } as const;
  const where = { status: "ACTIVE" as const, id: { notIn: [viewerId, ...blocked] }, ...(q ? { username: { startsWith: q } } : {}) };
  const following = await db.user.findMany({ where: { ...where, followers: { some: { followerId: viewerId } } }, orderBy: { username: "asc" }, take: limit, select });
  const others = following.length >= limit ? [] : await db.user.findMany({ where: { ...where, id: { notIn: [viewerId, ...blocked, ...following.map((u) => u.id)] } }, orderBy: [{ followerCount: "desc" }, { username: "asc" }], take: limit - following.length, select });
  return [...following, ...others].map((u) => ({ id: u.id, name: u.name, username: u.username, image: userAvatarUrl(u), following: following.some((f) => f.id === u.id) }));
}
