import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { notify, unnotify } from "@/server/modules/notifications";
import { consumeRateLimit, enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { bumpTrackDailyStat, utcDay } from "@/server/modules/stats";
import { trackAccessSelect } from "@/server/modules/visibility";
import { rateLimited } from "@/server/errors";

import type { AccessParams } from "./access";
import { authorizeTrack } from "./authorize";

export { likedByMeSelect } from "./dto";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Track not found" });

/**
 * Idempotent like / unlike of a track. Rules (PRD 9.5, VI-2, LK-3):
 * - the track must be visible to the caller (hidden tracks look nonexistent: NOT_FOUND);
 * - you cannot like your own track, and private tracks cannot be liked even through a secret link;
 * - at most 60 requests a minute, and at most 10 effective toggles of one track per 10 minutes.
 *
 * `Track.likeCount` (and the daily stat) only move when a `TrackLike` row is actually inserted or
 * deleted, inside one transaction, so repeats, double clicks and concurrent requests cannot drift
 * the counter away from the rows it summarises.
 */
export async function setTrackLike(
  db: PrismaClient,
  {
    userId,
    trackId,
    liked,
    access: params,
    now = clockNow(),
  }: { userId: string; trackId: string; liked: boolean; access?: AccessParams; now?: Date },
): Promise<{ liked: boolean; likeCount: number }> {
  const track = await db.track.findUnique({ where: { id: trackId }, select: trackAccessSelect });
  const access = track && (await authorizeTrack(db, track, { ...params, viewerId: userId }, now));
  if (!track || !access) throw notFound();
  if (track.creatorId === userId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't like your own track" });
  }
  if (liked && access !== "public") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Private tracks can't be liked or reposted" });
  }

  await enforceRateLimit(db, "like", userId, RATE_LIMITS.likePerMinute);

  return db.$transaction(async (tx) => {
    let delta: number;
    if (liked) {
      delta = (await tx.trackLike.createMany({ data: [{ userId, trackId, createdAt: now }], skipDuplicates: true })).count;
      if (delta) await bumpTrackDailyStat(tx, trackId, "likes", 1, now);
    } else {
      const existing = await tx.trackLike.findUnique({
        where: { userId_trackId: { userId, trackId } },
        select: { createdAt: true },
      });
      delta = -(await tx.trackLike.deleteMany({ where: { userId, trackId } })).count;
      // Undoing a like from an earlier day does not rewrite that day's statistics.
      if (delta && existing && utcDay(existing.createdAt).getTime() === utcDay(now).getTime()) {
        await bumpTrackDailyStat(tx, trackId, "likes", -1, now);
      }
    }

    if (delta) {
      const target = { recipientId: track.creatorId, actorId: userId, type: "TRACK_LIKE" as const, trackId };
      if (delta > 0) await notify(tx, { ...target, now });
      else await unnotify(tx, target);
    }

    if (delta) {
      // Inside the transaction: only toggles that are committed count towards the limit, and a
      // rejected one rolls the like back together with its own count.
      const toggles = await consumeRateLimit(tx, `like-target:${userId}:${trackId}`, RATE_LIMITS.likeSameTarget, now);
      if (!toggles.ok) throw rateLimited(toggles.retryAfterSeconds);
    }

    const row = delta
      ? await tx.track.update({
          where: { id: trackId },
          data: { likeCount: { increment: delta } },
          select: { likeCount: true },
        })
      : await tx.track.findUniqueOrThrow({ where: { id: trackId }, select: { likeCount: true } });
    return { liked, likeCount: row.likeCount };
  });
}
