import { TRPCError } from "@trpc/server";

import type { PlaySource, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { getEntitlements, type Plan } from "@/server/modules/plans/entitlements";
import { utcDay } from "@/server/modules/stats";
import { planRequired } from "@/server/errors";

export const INSIGHT_RANGES = ["7", "30", "90", "365", "all"] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];
const DAY_MS = 86_400_000;
/** Play events are only broken down over at most this many days (PRD IN-6). */
const EVENT_DAYS = 90;

const rangeDays = (range: InsightRange) => (range === "all" ? null : Number(range));

export interface Totals { plays: number; likes: number; reposts: number; comments: number; downloads: number; newFollowers: number }
const zero = (): Totals => ({ plays: 0, likes: 0, reposts: 0, comments: 0, downloads: 0, newFollowers: 0 });

/** Which ranges this plan may open (IN-1); "all" means the all-time totals, available to everyone. */
export function allowedRanges(user: { plan: Plan }): InsightRange[] {
  const e = getEntitlements(user);
  return [...INSIGHT_RANGES.filter((r) => r !== "all" && e.insightsRangesDays.includes(Number(r))), ...(e.insightsAllTimeTotals ? (["all"] as const) : [])];
}

/** Buckets of the "plays over time" chart: daily up to 90 days, weekly beyond (IN-3). */
export function bucketSeries(days: { day: Date; plays: number }[], from: Date, to: Date, weekly: boolean) {
  const byDay = new Map(days.map((d) => [utcDay(d.day).getTime(), d.plays]));
  const out: { start: Date; plays: number }[] = [];
  const step = weekly ? 7 : 1;
  for (let t = utcDay(from).getTime(); t <= utcDay(to).getTime(); t += step * DAY_MS) {
    let plays = 0;
    for (let i = 0; i < step; i++) plays += byDay.get(t + i * DAY_MS) ?? 0;
    out.push({ start: new Date(t), plays });
  }
  return out;
}

/**
 * Insights (PRD 15.3): tiles with change vs the previous period, plays over time, top tracks (all plans), and for Pro
 * countries, sources, top listeners and the per-track drill-down. The owner's own plays are never counted (they are stored
 * with `counted = false`), so everything here excludes them.
 */
export async function insights(
  db: PrismaClient,
  user: { id: string; plan: Plan },
  { range = "7", trackId, now = clockNow() }: { range?: InsightRange; trackId?: string; now?: Date },
) {
  const entitlements = getEntitlements(user);
  if (!allowedRanges(user).includes(range)) throw planRequired("That time range is a Pro feature");
  if (trackId && !entitlements.insightsBreakdowns) throw planRequired("Per-track insights are a Pro feature");
  if (trackId) {
    const own = await db.track.findFirst({ where: { id: trackId, creatorId: user.id }, select: { id: true } });
    if (!own) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
  }

  const days = rangeDays(range);
  const today = utcDay(now);
  const from = days === null ? new Date(0) : new Date(today.getTime() - (days - 1) * DAY_MS);
  const prevFrom = days === null ? null : new Date(from.getTime() - days * DAY_MS);
  const trackWhere = { track: { creatorId: user.id, ...(trackId ? { id: trackId } : {}) } };

  const sumStats = async (gte: Date, lt?: Date) => {
    const agg = await db.trackDailyStat.aggregate({ where: { ...trackWhere, day: { gte, ...(lt ? { lt } : {}) } }, _sum: { plays: true, likes: true, reposts: true, comments: true, downloads: true } });
    const followers = trackId ? null : await db.userDailyStat.aggregate({ where: { userId: user.id, day: { gte, ...(lt ? { lt } : {}) } }, _sum: { newFollowers: true } });
    return { plays: agg._sum.plays ?? 0, likes: agg._sum.likes ?? 0, reposts: agg._sum.reposts ?? 0, comments: agg._sum.comments ?? 0, downloads: agg._sum.downloads ?? 0, newFollowers: followers?._sum.newFollowers ?? 0 } satisfies Totals;
  };

  const [current, previous, daily] = await Promise.all([
    sumStats(from),
    prevFrom ? sumStats(prevFrom, from) : Promise.resolve(null),
    db.trackDailyStat.groupBy({ by: ["day"], where: { ...trackWhere, day: { gte: days === null ? new Date(now.getTime() - 365 * DAY_MS) : from } }, _sum: { plays: true }, orderBy: { day: "asc" } }),
  ]);
  const seriesFrom = days === null ? new Date(now.getTime() - 365 * DAY_MS) : from;
  const series = bucketSeries(daily.map((d) => ({ day: d.day, plays: d._sum.plays ?? 0 })), seriesFrom, today, (days ?? 365) > EVENT_DAYS);

  // Top tracks in range, with completion rate from counted play events.
  const topStats = await db.trackDailyStat.groupBy({ by: ["trackId"], where: { ...trackWhere, day: { gte: from } }, _sum: { plays: true, likes: true }, orderBy: { _sum: { plays: "desc" } }, take: 10 });
  const eventFrom = new Date(Math.max(from.getTime(), now.getTime() - EVENT_DAYS * DAY_MS));
  const topIds = topStats.map((t) => t.trackId);
  const [titles, completion] = await Promise.all([
    db.track.findMany({ where: { id: { in: topIds } }, select: { id: true, title: true, slug: true, creator: { select: { username: true } } } }),
    db.playEvent.groupBy({ by: ["trackId", "completed"], where: { trackId: { in: topIds }, counted: true, createdAt: { gte: eventFrom } }, _count: { _all: true } }),
  ]);
  const topTracks = topStats.flatMap((t) => {
    const info = titles.find((x) => x.id === t.trackId);
    if (!info) return [];
    const done = completion.find((c) => c.trackId === t.trackId && c.completed)?._count._all ?? 0;
    const all = completion.filter((c) => c.trackId === t.trackId).reduce((n, c) => n + c._count._all, 0);
    return [{ id: info.id, title: info.title, permalink: `/${info.creator.username}/${info.slug}`, plays: t._sum.plays ?? 0, likes: t._sum.likes ?? 0, completionRate: all > 0 ? done / all : null }];
  });

  const result = {
    range,
    plan: user.plan,
    allowedRanges: allowedRanges(user),
    totals: current,
    previous,
    series,
    weekly: (days ?? 365) > EVENT_DAYS,
    topTracks,
    breakdowns: null as null | {
      countries: { country: string; plays: number }[];
      sources: { source: PlaySource; plays: number }[];
      listeners: { id: string; name: string; username: string; plays: number }[];
    },
  };
  if (!entitlements.insightsBreakdowns) return result;

  // PRO breakdowns from counted play events over at most 90 days.
  const eventWhere = { counted: true, createdAt: { gte: eventFrom }, track: { creatorId: user.id, ...(trackId ? { id: trackId } : {}) } };
  const [countries, sources, listeners] = await Promise.all([
    db.playEvent.groupBy({ by: ["countryCode"], where: eventWhere, _count: { _all: true }, orderBy: { _count: { countryCode: "desc" } }, take: 10 }),
    db.playEvent.groupBy({ by: ["source"], where: eventWhere, _count: { _all: true }, orderBy: { _count: { source: "desc" } } }),
    db.playEvent.groupBy({ by: ["listenerId"], where: { ...eventWhere, listenerId: { not: null }, listener: { showInTopListeners: true, status: "ACTIVE" } }, _count: { _all: true }, orderBy: { _count: { listenerId: "desc" } }, take: 10 }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: listeners.flatMap((l) => (l.listenerId ? [l.listenerId] : [])) } }, select: { id: true, name: true, username: true } });
  result.breakdowns = {
    countries: countries.map((c) => ({ country: c.countryCode ?? "Unknown", plays: c._count._all })),
    sources: sources.map((s) => ({ source: s.source, plays: s._count._all })),
    listeners: listeners.flatMap((l) => {
      const u = users.find((x) => x.id === l.listenerId);
      return u ? [{ ...u, plays: l._count._all }] : [];
    }),
  };
  return result;
}

export { zero as emptyTotals };
