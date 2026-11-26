import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Repairs every denormalised counter from the rows it summarises (PRD 16.4, `pnpm db:recount`),
 * and rebuilds the daily statistics from raw events. Normal code paths keep counters exact by
 * changing them in the same transaction as the rows; this is for seeds, migrations and account
 * deletion, which change many rows at once.
 */
export async function recountCounters(db: Pick<PrismaClient, "$executeRawUnsafe">) {
  for (const sql of COUNTER_STATEMENTS) await db.$executeRawUnsafe(sql);
}

export async function rebuildDailyStats(db: Pick<PrismaClient, "$executeRawUnsafe">) {
  for (const sql of DAILY_STAT_STATEMENTS) await db.$executeRawUnsafe(sql);
}

export async function recountAll(db: Pick<PrismaClient, "$executeRawUnsafe">) {
  await recountCounters(db);
  await rebuildDailyStats(db);
}

const COUNTER_STATEMENTS = [
    `UPDATE "track" t SET
       "likeCount" = (SELECT count(*) FROM "track_like" x WHERE x."trackId" = t."id"),
       "repostCount" = (SELECT count(*) FROM "track_repost" x WHERE x."trackId" = t."id"),
       "commentCount" = (SELECT count(*) FROM "comment" x WHERE x."trackId" = t."id"),
       "playCount" = (SELECT count(*) FROM "play_event" x WHERE x."trackId" = t."id" AND x."counted")`,
    `UPDATE "collection" c SET
       "likeCount" = (SELECT count(*) FROM "collection_like" x WHERE x."collectionId" = c."id"),
       "repostCount" = (SELECT count(*) FROM "collection_repost" x WHERE x."collectionId" = c."id"),
       "playCount" = (SELECT count(*) FROM "play_event" x WHERE x."collectionId" = c."id" AND x."counted"),
       "trackCount" = (SELECT count(*) FROM "collection_track" x WHERE x."collectionId" = c."id"),
       "durationMs" = COALESCE((SELECT sum(t."durationMs") FROM "collection_track" x JOIN "track" t ON t."id" = x."trackId" WHERE x."collectionId" = c."id"), 0)`,
    `UPDATE "comment" c SET "likeCount" = (SELECT count(*) FROM "comment_like" x WHERE x."commentId" = c."id")`,
    `UPDATE "user" u SET
       "followerCount" = (SELECT count(*) FROM "follow" x WHERE x."followingId" = u."id"),
       "followingCount" = (SELECT count(*) FROM "follow" x WHERE x."followerId" = u."id"),
       "publicTrackCount" = (SELECT count(*) FROM "track" t WHERE t."creatorId" = u."id" AND t."moderationState" = 'VISIBLE'
         AND (t."visibility" = 'PUBLIC' OR (t."visibility" = 'SCHEDULED' AND t."publishAt" <= now())))`,
];

const DAILY_STAT_STATEMENTS = [
    // Daily statistics: rebuilt from the events and rows they summarise.
    `DELETE FROM "track_daily_stat"`,
    `INSERT INTO "track_daily_stat" ("trackId", "day", "plays", "likes", "reposts", "comments", "downloads")
     SELECT "trackId", "day", sum("plays")::int, sum("likes")::int, sum("reposts")::int, sum("comments")::int, 0 FROM (
       SELECT "trackId", ("createdAt" AT TIME ZONE 'UTC')::date AS "day", 1 AS "plays", 0 AS "likes", 0 AS "reposts", 0 AS "comments" FROM "play_event" WHERE "counted"
       UNION ALL SELECT "trackId", ("createdAt" AT TIME ZONE 'UTC')::date, 0, 1, 0, 0 FROM "track_like"
       UNION ALL SELECT "trackId", ("createdAt" AT TIME ZONE 'UTC')::date, 0, 0, 1, 0 FROM "track_repost"
       UNION ALL SELECT "trackId", ("createdAt" AT TIME ZONE 'UTC')::date, 0, 0, 0, 1 FROM "comment"
     ) events GROUP BY "trackId", "day"`,
    `DELETE FROM "user_daily_stat"`,
    `INSERT INTO "user_daily_stat" ("userId", "day", "newFollowers", "lostFollowers")
     SELECT "followingId", ("createdAt" AT TIME ZONE 'UTC')::date, count(*)::int, 0 FROM "follow" GROUP BY 1, 2`,
];
