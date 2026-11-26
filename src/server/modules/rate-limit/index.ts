import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { rateLimited } from "@/server/errors";

type Db = Pick<PrismaClient, "$queryRaw">;

export interface RateRule {
  max: number;
  windowSeconds: number;
}

/** Limits from PRD 14.3. Tune here. */
export const RATE_LIMITS = {
  commentPerMinute: { max: 8, windowSeconds: 60 },
  commentPerDay: { max: 200, windowSeconds: 86_400 },
  likePerMinute: { max: 60, windowSeconds: 60 },
  likeSameTarget: { max: 10, windowSeconds: 600 },
  repostPerMinute: { max: 30, windowSeconds: 60 },
  followPerMinute: { max: 60, windowSeconds: 60 },
  followPerDay: { max: 500, windowSeconds: 86_400 },
  playlistEditPerMinute: { max: 120, windowSeconds: 60 },
  uploadUrlPerMinute: { max: 30, windowSeconds: 60 },
  uploadUrlPerDay: { max: 300, windowSeconds: 86_400 },
  reportPerDay: { max: 20, windowSeconds: 86_400 },
  messagePerMinute: { max: 30, windowSeconds: 60 },
  /** MS-4: accounts younger than 7 days may open 10 new conversations a day. */
  newConversationPerDay: { max: 10, windowSeconds: 86_400 },
  searchAnonymousPerMinute: { max: 60, windowSeconds: 60 },
  emailPerHour: { max: 3, windowSeconds: 3_600 },
} as const satisfies Record<string, RateRule>;

export interface RateResult {
  ok: boolean;
  /** Attempts counted in the current window, including this one. */
  count: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter: one upsert that increments and returns the count atomically, so
 * concurrent requests can never both slip under the limit. The window size is part of the key,
 * so the same subject can have a per-minute and a per-day rule side by side.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  rule: RateRule,
  at: Date = clockNow(),
): Promise<RateResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStartMs = Math.floor(at.getTime() / windowMs) * windowMs;
  const bucketKey = `${key}|${rule.windowSeconds}`;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_bucket" ("key", "windowStart", "count")
    VALUES (${bucketKey}, ${new Date(windowStartMs)}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "rate_limit_bucket"."count" + 1
    RETURNING "count"`;
  const count = rows[0]?.count ?? 1;
  return {
    ok: count <= rule.max,
    count,
    remaining: Math.max(0, rule.max - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - at.getTime()) / 1000)),
  };
}

/** Consumes every rule for the subject and throws `TOO_MANY_REQUESTS` (with `retryAfterSeconds`) on the first exceeded one. */
export async function enforceRateLimit(
  db: Db,
  action: string,
  subject: string,
  ...rules: RateRule[]
): Promise<void> {
  for (const rule of rules) {
    const result = await consumeRateLimit(db, `${action}:${subject}`, rule);
    if (!result.ok) throw rateLimited(result.retryAfterSeconds);
  }
}

/** Daily housekeeping: buckets older than two days can never matter again. */
export async function pruneRateLimitBuckets(
  db: Pick<PrismaClient, "rateLimitBucket">,
  at: Date = clockNow(),
) {
  const result = await db.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(at.getTime() - 2 * 86_400_000) } },
  });
  return result.count;
}
