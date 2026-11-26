import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { appError, rateLimited } from "@/server/errors";
import { consumeRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { notify, unnotify } from "@/server/modules/notifications";
import { bumpUserDailyStat } from "@/server/modules/stats";

export const MAX_FOLLOWINGS = 2000;

/** Whether either user blocked the other (PRD BL-1). */
export async function isBlockedEitherWay(db: Pick<PrismaClient, "block">, a: string, b: string) {
  return (
    (await db.block.findFirst({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
      select: { blockerId: true },
    })) !== null
  );
}

/**
 * Idempotent follow / unfollow (PRD FO-1, FO-2). `followerCount`, `followingCount` and the daily
 * statistics only move by the number of `Follow` rows really inserted or deleted, in the same
 * transaction, so repeats, double clicks and races cannot drift them. Rate limited (60/min and
 * 500/day), counting only committed changes; at most 2000 followings per user.
 */
export async function setFollow(
  db: PrismaClient,
  {
    followerId,
    followingId,
    follow,
    now = clockNow(),
  }: { followerId: string; followingId: string; follow: boolean; now?: Date },
): Promise<{ following: boolean; followerCount: number }> {
  if (followerId === followingId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't follow yourself" });
  }
  const target = await db.user.findUnique({ where: { id: followingId }, select: { status: true } });
  if (target?.status !== "ACTIVE") throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  if (follow && (await isBlockedEitherWay(db, followerId, followingId))) {
    throw appError("FORBIDDEN", "BLOCKED", "You can't follow this user");
  }

  return db.$transaction(async (tx) => {
    let delta: number;
    if (follow) {
      const total = await tx.follow.count({ where: { followerId } });
      const already = await tx.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
        select: { followerId: true },
      });
      if (!already && total >= MAX_FOLLOWINGS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `You can follow at most ${MAX_FOLLOWINGS} people` });
      }
      delta = (await tx.follow.createMany({ data: [{ followerId, followingId, createdAt: now }], skipDuplicates: true })).count;
    } else {
      delta = -(await tx.follow.deleteMany({ where: { followerId, followingId } })).count;
    }

    if (delta) {
      for (const rule of [RATE_LIMITS.followPerMinute, RATE_LIMITS.followPerDay]) {
        const result = await consumeRateLimit(tx, `follow:${followerId}`, rule, now);
        if (!result.ok) throw rateLimited(result.retryAfterSeconds);
      }
      await tx.user.update({ where: { id: followingId }, data: { followerCount: { increment: delta } } });
      await tx.user.update({ where: { id: followerId }, data: { followingCount: { increment: delta } } });
      await bumpUserDailyStat(tx, followingId, delta > 0 ? "newFollowers" : "lostFollowers", 1, now);
      if (delta > 0) await notify(tx, { recipientId: followingId, actorId: followerId, type: "FOLLOW", now });
      else await unnotify(tx, { recipientId: followingId, actorId: followerId, type: "FOLLOW" });
    }

    const row = await tx.user.findUniqueOrThrow({ where: { id: followingId }, select: { followerCount: true } });
    return { following: follow, followerCount: row.followerCount };
  });
}
