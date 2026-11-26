import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { publicTrackWhere } from "@/server/modules/visibility";

const DAY_MS = 86_400_000;
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; ids: { id: string; plays: number }[] }>();
export const clearChartCache = () => cache.clear();

/** Ranked track ids with the plays they were ranked by, cached 10 minutes (CH-2). */
async function ranked(key: string, compute: () => Promise<{ id: string; plays: number }[]>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids;
  const ids = await compute();
  // An empty chart is not cached: the first plays should show up immediately.
  if (ids.length > 0) cache.set(key, { at: Date.now(), ids });
  return ids;
}

async function hydrate(db: PrismaClient, entries: { id: string; plays: number }[], viewerId: string | null, now: Date, limit: number) {
  const rows = await db.track.findMany({ where: { AND: [{ id: { in: entries.map((e) => e.id) } }, publicTrackWhere(now)] }, select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Visibility is re-checked at read time: a track made private since the cache was filled drops out.
  return entries.flatMap((e) => (byId.has(e.id) ? [{ rank: 0, plays: e.plays, track: toTrackDto(byId.get(e.id)!, { viewerId }) }] : [])).slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}

/** CH-1 Top 50: tracks by counted plays in the last 7 days (from `TrackDailyStat`), optionally per genre. */
export async function topChart(db: PrismaClient, { genre, limit = 50, viewerId = null, now = clockNow() }: { genre?: string; limit?: number; viewerId?: string | null; now?: Date } = {}) {
  const entries = await ranked(`top:${genre ?? "all"}`, async () => {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const rows = await db.$queryRaw<{ id: string; plays: bigint }[]>(Prisma.sql`
      SELECT s."trackId" AS id, sum(s.plays) AS plays
      FROM "track_daily_stat" s JOIN "track" t ON t.id = s."trackId"
      WHERE s.day >= ${since}::date AND s.plays > 0 ${genre ? Prisma.sql`AND t."genre" = ${genre}` : Prisma.empty}
      GROUP BY s."trackId" ORDER BY sum(s.plays) DESC, s."trackId" ASC LIMIT ${limit * 2}`);
    return rows.map((r) => ({ id: r.id, plays: Number(r.plays) }));
  });
  return hydrate(db, entries, viewerId, now, limit);
}

/** CH-1 New & Hot: tracks first published in the last 30 days ranked by plays per day since publication, with a recency boost. */
export async function newAndHotChart(db: PrismaClient, { genre, limit = 50, viewerId = null, now = clockNow() }: { genre?: string; limit?: number; viewerId?: string | null; now?: Date } = {}) {
  const entries = await ranked(`hot:${genre ?? "all"}`, async () => {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const rows = await db.track.findMany({
      where: { AND: [publicTrackWhere(now), { publishedAt: { gte: since } }, ...(genre ? [{ genre }] : [])] },
      select: { id: true, playCount: true, publishedAt: true },
      take: 500,
    });
    return rows
      .map((r) => {
        const ageDays = Math.max(1, (now.getTime() - (r.publishedAt ?? now).getTime()) / DAY_MS);
        return { id: r.id, plays: r.playCount, score: (r.playCount / ageDays) * (1 + (30 - Math.min(30, ageDays)) / 30) };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit * 2)
      .map(({ id, plays }) => ({ id, plays }));
  });
  return hydrate(db, entries, viewerId, now, limit);
}
