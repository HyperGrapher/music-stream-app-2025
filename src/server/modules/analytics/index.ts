import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { userAvatarUrl } from "@/server/modules/tracks/dto";

/**
 * Visitor analytics for admins: one `PageView` row per page opened, kept fresh by a heartbeat, so "online now",
 * time on page, sessions, countries and top pages all come from the same table. Raw IPs are cleared after 30 days and
 * rows deleted after 90 (daily cron).
 */
export const ONLINE_WINDOW_MS = 2 * 60_000;
export const IP_RETENTION_DAYS = 30;
export const VIEW_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
/** A page left open overnight must not count as eight hours of reading. */
const MAX_PAGE_SECONDS = 30 * 60;

export interface HitInput {
  visitorId: string;
  sessionId: string;
  userId: string | null;
  ip: string | null;
  countryCode: string | null;
  city: string | null;
  path: string;
  referrer: string | null;
  userAgent: string | null;
  device: string;
  browser: string;
  now?: Date;
}

export async function recordHit(db: PrismaClient, input: HitInput) {
  const at = input.now ?? clockNow();
  const row = await db.pageView.create({
    data: {
      visitorId: input.visitorId, sessionId: input.sessionId, userId: input.userId, ip: input.ip, countryCode: input.countryCode, city: input.city,
      path: input.path, referrer: input.referrer, userAgent: input.userAgent?.slice(0, 300) ?? null, device: input.device, browser: input.browser, startedAt: at, lastSeenAt: at,
    },
    select: { id: true },
  });
  return row.id;
}

/** Heartbeat: the visitor is still on this page. Only the visitor that opened the view can touch it. */
export async function touchView(db: PrismaClient, viewId: string, visitorId: string, now = clockNow()) {
  await db.pageView.updateMany({ where: { id: viewId, visitorId }, data: { lastSeenAt: now } });
}

const secondsOn = Prisma.sql`LEAST(${MAX_PAGE_SECONDS}, GREATEST(0, EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt"))))`;

/** Everyone seen in the last two minutes, one row per visitor (their latest page), newest activity first. */
export async function onlineNow(db: PrismaClient, now = clockNow()) {
  const since = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const rows = await db.$queryRaw<{ id: string; visitorId: string; sessionId: string; userId: string | null; ip: string | null; countryCode: string | null; city: string | null; path: string; device: string; browser: string | null; startedAt: Date; lastSeenAt: Date; sessionStart: Date; pages: number }[]>(Prisma.sql`
    SELECT DISTINCT ON (v."visitorId") v."id", v."visitorId", v."sessionId", v."userId", v."ip", v."countryCode", v."city", v."path", v."device", v."browser", v."startedAt", v."lastSeenAt",
      (SELECT min(s."startedAt") FROM "page_view" s WHERE s."sessionId" = v."sessionId") AS "sessionStart",
      (SELECT count(*)::int FROM "page_view" s WHERE s."sessionId" = v."sessionId") AS "pages"
    FROM "page_view" v WHERE v."lastSeenAt" >= ${since}
    ORDER BY v."visitorId", v."lastSeenAt" DESC`);
  const users = await db.user.findMany({
    where: { id: { in: rows.flatMap((r) => (r.userId ? [r.userId] : [])) } },
    select: { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const visitors = rows
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .map((r) => {
      const user = r.userId ? byId.get(r.userId) : undefined;
      return {
        visitorId: r.visitorId, ip: r.ip, countryCode: r.countryCode, city: r.city, path: r.path, device: r.device, browser: r.browser,
        onPageSeconds: Math.round((r.lastSeenAt.getTime() - r.startedAt.getTime()) / 1000),
        onSiteSeconds: Math.round((r.lastSeenAt.getTime() - r.sessionStart.getTime()) / 1000),
        pages: r.pages,
        user: user ? { id: user.id, name: user.name, username: user.username, image: userAvatarUrl(user) } : null,
      };
    });
  return { total: visitors.length, registered: visitors.filter((v) => v.user).length, guests: visitors.filter((v) => !v.user).length, visitors };
}

type Count = { label: string | null; visitors: number; views: number };

/**
 * The dashboard for the last `days` days (UTC days, today included): totals, daily series, top pages, countries,
 * referrers, devices, browsers and the latest sessions.
 */
export async function overview(db: PrismaClient, { days = 7, now = clockNow() }: { days?: number; now?: Date } = {}) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS);
  const grouped = (column: string) =>
    db.$queryRaw<Count[]>(Prisma.sql`
      SELECT ${Prisma.raw(`"${column}"`)} AS label, count(DISTINCT "visitorId")::int AS visitors, count(*)::int AS views
      FROM "page_view" WHERE "startedAt" >= ${since} GROUP BY 1 ORDER BY views DESC, label ASC LIMIT 15`);

  const [totals, series, pages, countries, referrers, devices, browsers, sessions] = await Promise.all([
    db.$queryRaw<{ visitors: number; views: number; sessions: number; registered: number; avgSeconds: number | null; bounced: number }[]>(Prisma.sql`
      SELECT count(DISTINCT "visitorId")::int AS visitors, count(*)::int AS views, count(DISTINCT "sessionId")::int AS sessions,
        count(DISTINCT "visitorId") FILTER (WHERE "userId" IS NOT NULL)::int AS registered,
        avg(${secondsOn})::float AS "avgSeconds",
        (SELECT count(*)::int FROM (SELECT "sessionId" FROM "page_view" WHERE "startedAt" >= ${since} GROUP BY "sessionId" HAVING count(*) = 1) one) AS bounced
      FROM "page_view" WHERE "startedAt" >= ${since}`),
    db.$queryRaw<{ day: Date; visitors: number; views: number }[]>(Prisma.sql`
      SELECT date_trunc('day', "startedAt") AS day, count(DISTINCT "visitorId")::int AS visitors, count(*)::int AS views
      FROM "page_view" WHERE "startedAt" >= ${since} GROUP BY 1 ORDER BY 1`),
    db.$queryRaw<{ path: string; visitors: number; views: number; avgSeconds: number }[]>(Prisma.sql`
      SELECT "path", count(DISTINCT "visitorId")::int AS visitors, count(*)::int AS views, avg(${secondsOn})::float AS "avgSeconds"
      FROM "page_view" WHERE "startedAt" >= ${since} GROUP BY "path" ORDER BY views DESC, "path" ASC LIMIT 15`),
    grouped("countryCode"),
    grouped("referrer"),
    grouped("device"),
    grouped("browser"),
    db.$queryRaw<{ sessionId: string; visitorId: string; userId: string | null; ip: string | null; countryCode: string | null; started: Date; ended: Date; pages: number; entry: string; exit: string }[]>(Prisma.sql`
      SELECT "sessionId", (array_agg("visitorId"))[1] AS "visitorId", (array_agg("userId") FILTER (WHERE "userId" IS NOT NULL))[1] AS "userId",
        (array_agg("ip" ORDER BY "startedAt"))[1] AS "ip", (array_agg("countryCode" ORDER BY "startedAt"))[1] AS "countryCode",
        min("startedAt") AS started, max("lastSeenAt") AS ended, count(*)::int AS pages,
        (array_agg("path" ORDER BY "startedAt" ASC))[1] AS entry, (array_agg("path" ORDER BY "startedAt" DESC))[1] AS "exit"
      FROM "page_view" WHERE "startedAt" >= ${since} GROUP BY "sessionId" ORDER BY max("lastSeenAt") DESC LIMIT 40`),
  ]);
  const t = totals[0] ?? { visitors: 0, views: 0, sessions: 0, registered: 0, avgSeconds: null, bounced: 0 };
  const users = await db.user.findMany({ where: { id: { in: sessions.flatMap((s) => (s.userId ? [s.userId] : [])) } }, select: { id: true, name: true, username: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    days,
    totals: { visitors: t.visitors, registered: t.registered, guests: t.visitors - t.registered, views: t.views, sessions: t.sessions, avgSecondsOnPage: Math.round(t.avgSeconds ?? 0), bounceRate: t.sessions ? t.bounced / t.sessions : 0 },
    series, pages, countries, referrers, devices, browsers,
    sessions: sessions.map((s) => ({ ...s, user: s.userId ? (byId.get(s.userId) ?? null) : null, seconds: Math.round((s.ended.getTime() - s.started.getTime()) / 1000) })),
  };
}

/** Daily cron: IPs are personal data, so they go after 30 days; the rest of the row after 90. */
export async function pruneAnalytics(db: PrismaClient, now: Date) {
  const ips = await db.pageView.updateMany({ where: { ip: { not: null }, startedAt: { lt: new Date(now.getTime() - IP_RETENTION_DAYS * DAY_MS) } }, data: { ip: null } });
  const views = await db.pageView.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - VIEW_RETENTION_DAYS * DAY_MS) } } });
  return { ipsCleared: ips.count, pageViewsDeleted: views.count };
}
