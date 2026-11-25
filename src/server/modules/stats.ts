import { Prisma, type PrismaClient } from "@/generated/prisma/client";

type StatDb = Pick<PrismaClient, "$executeRaw">;

export type TrackStatColumn = "plays" | "likes" | "reposts" | "comments" | "downloads";
const TRACK_STAT_COLUMNS: readonly TrackStatColumn[] = ["plays", "likes", "reposts", "comments", "downloads"];

/** UTC calendar day of `at`, as the `date` value stored in the daily stat tables. */
export function utcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Adds `delta` to one column of the track's row for `at`'s UTC day (PRD IN-6), creating it if
 * needed. Never goes below zero. Call it inside the transaction of the action it counts.
 * Undoing an action on a later day is deliberately not subtracted (callers decide).
 */
export async function bumpTrackDailyStat(
  db: StatDb,
  trackId: string,
  column: TrackStatColumn,
  delta: number,
  at: Date,
) {
  if (delta === 0) return;
  if (!TRACK_STAT_COLUMNS.includes(column)) throw new Error(`Unknown stat column ${column}`);
  const col = Prisma.raw(`"${column}"`);
  await db.$executeRaw`
    INSERT INTO "track_daily_stat" ("trackId", "day", ${col})
    VALUES (${trackId}, ${utcDay(at)}, ${Math.max(0, delta)})
    ON CONFLICT ("trackId", "day")
    DO UPDATE SET ${col} = GREATEST(0, "track_daily_stat".${col} + ${delta})`;
}

export async function bumpUserDailyStat(
  db: StatDb,
  userId: string,
  column: "newFollowers" | "lostFollowers",
  delta: number,
  at: Date,
) {
  if (delta === 0) return;
  const col = Prisma.raw(`"${column}"`);
  await db.$executeRaw`
    INSERT INTO "user_daily_stat" ("userId", "day", ${col})
    VALUES (${userId}, ${utcDay(at)}, ${Math.max(0, delta)})
    ON CONFLICT ("userId", "day")
    DO UPDATE SET ${col} = GREATEST(0, "user_daily_stat".${col} + ${delta})`;
}
