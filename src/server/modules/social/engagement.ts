import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { rateLimited } from "@/server/errors";
import { notify, unnotify } from "@/server/modules/notifications";
import { consumeRateLimit, enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { bumpTrackDailyStat, utcDay } from "@/server/modules/stats";
import type { AccessParams } from "@/server/modules/tracks/access";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import { collectionAccess, collectionAccessSelect, trackAccessSelect } from "@/server/modules/visibility";

const notFound = (what: string) => new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });
const CAPTION_MAX = 140;

async function visibleCollection(db: PrismaClient, collectionId: string, userId: string, secret?: string | null) {
  const collection = await db.collection.findUnique({ where: { id: collectionId }, select: { ...collectionAccessSelect } });
  const access = collection && collectionAccess(collection, { viewerId: userId, secret });
  if (!collection || !access) throw notFound("Collection");
  return { collection, access };
}

/** Idempotent like / unlike of a collection (LK-1): not your own, public only; counter moves with real rows. */
export async function setCollectionLike(
  db: PrismaClient,
  { userId, collectionId, liked, secret, now = clockNow() }: { userId: string; collectionId: string; liked: boolean; secret?: string | null; now?: Date },
): Promise<{ liked: boolean; likeCount: number }> {
  const { collection, access } = await visibleCollection(db, collectionId, userId, secret);
  if (collection.ownerId === userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't like your own collection" });
  if (liked && access !== "public") throw new TRPCError({ code: "BAD_REQUEST", message: "Private collections can't be liked or reposted" });
  await enforceRateLimit(db, "like", userId, RATE_LIMITS.likePerMinute);

  return db.$transaction(async (tx) => {
    const delta = liked
      ? (await tx.collectionLike.createMany({ data: [{ userId, collectionId, createdAt: now }], skipDuplicates: true })).count
      : -(await tx.collectionLike.deleteMany({ where: { userId, collectionId } })).count;
    if (delta) {
      const toggles = await consumeRateLimit(tx, `like-target:${userId}:${collectionId}`, RATE_LIMITS.likeSameTarget, now);
      if (!toggles.ok) throw rateLimited(toggles.retryAfterSeconds);
      const target = { recipientId: collection.ownerId, actorId: userId, type: "COLLECTION_LIKE" as const, collectionId };
      if (delta > 0) await notify(tx, { ...target, now });
      else await unnotify(tx, target);
      await tx.collection.update({ where: { id: collectionId }, data: { likeCount: { increment: delta } } });
    }
    const row = await tx.collection.findUniqueOrThrow({ where: { id: collectionId }, select: { likeCount: true } });
    return { liked, likeCount: row.likeCount };
  });
}

/** Idempotent like / unlike of a comment (CM-1). Liking notifies the author (`COMMENT_LIKE`). */
export async function setCommentLike(
  db: PrismaClient,
  { userId, commentId, liked, access: params, now = clockNow() }: { userId: string; commentId: string; liked: boolean; access?: AccessParams; now?: Date },
): Promise<{ liked: boolean; likeCount: number }> {
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, trackId: true, track: { select: { ...trackAccessSelect } } },
  });
  const access = comment && (await authorizeTrack(db, comment.track, { ...params, viewerId: userId }, now));
  if (!comment || !access) throw notFound("Comment");
  await enforceRateLimit(db, "like", userId, RATE_LIMITS.likePerMinute);

  return db.$transaction(async (tx) => {
    const delta = liked
      ? (await tx.commentLike.createMany({ data: [{ userId, commentId, createdAt: now }], skipDuplicates: true })).count
      : -(await tx.commentLike.deleteMany({ where: { userId, commentId } })).count;
    if (delta) {
      const target = { recipientId: comment.authorId, actorId: userId, type: "COMMENT_LIKE" as const, trackId: comment.trackId, commentId };
      if (delta > 0) await notify(tx, { ...target, now });
      else await unnotify(tx, target);
      await tx.$executeRaw`UPDATE "comment" SET "likeCount" = GREATEST(0, "likeCount" + ${delta}) WHERE "id" = ${commentId}`;
    }
    const row = await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { likeCount: true } });
    return { liked, likeCount: row.likeCount };
  });
}

/**
 * Repost / un-repost a track (RP-1, RP-2): not your own, public only. Creates a feed `Activity` and a
 * `TRACK_REPOST` notification; undoing deletes both (the notification only if unread). Counter and
 * daily stats move with the row in the same transaction.
 */
export async function setTrackRepost(
  db: PrismaClient,
  { userId, trackId, reposted, caption, now = clockNow() }: { userId: string; trackId: string; reposted: boolean; caption?: string | null; now?: Date },
): Promise<{ reposted: boolean; repostCount: number }> {
  const track = await db.track.findUnique({ where: { id: trackId }, select: { ...trackAccessSelect } });
  const access = track && (await authorizeTrack(db, track, { viewerId: userId }, now));
  if (!track || !access) throw notFound("Track");
  if (track.creatorId === userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't repost your own track" });
  if (reposted && access !== "public") throw new TRPCError({ code: "BAD_REQUEST", message: "Private tracks can't be liked or reposted" });
  await enforceRateLimit(db, "repost", userId, RATE_LIMITS.repostPerMinute);
  const text = caption?.trim().slice(0, CAPTION_MAX) || null;

  return db.$transaction(async (tx) => {
    let delta: number;
    if (reposted) {
      delta = (await tx.trackRepost.createMany({ data: [{ userId, trackId, caption: text, createdAt: now }], skipDuplicates: true })).count;
      if (delta) {
        await tx.activity.create({ data: { actorId: userId, type: "TRACK_REPOSTED", trackId, createdAt: now } });
        await bumpTrackDailyStat(tx, trackId, "reposts", 1, now);
        await notify(tx, { recipientId: track.creatorId, actorId: userId, type: "TRACK_REPOST", trackId, now });
      }
    } else {
      const existing = await tx.trackRepost.findUnique({ where: { userId_trackId: { userId, trackId } }, select: { createdAt: true } });
      delta = -(await tx.trackRepost.deleteMany({ where: { userId, trackId } })).count;
      if (delta) {
        await tx.activity.deleteMany({ where: { actorId: userId, type: "TRACK_REPOSTED", trackId } });
        await unnotify(tx, { recipientId: track.creatorId, actorId: userId, type: "TRACK_REPOST", trackId });
        if (existing && utcDay(existing.createdAt).getTime() === utcDay(now).getTime()) await bumpTrackDailyStat(tx, trackId, "reposts", -1, now);
      }
    }
    if (delta) await tx.$executeRaw`UPDATE "track" SET "repostCount" = GREATEST(0, "repostCount" + ${delta}) WHERE "id" = ${trackId}`;
    const row = await tx.track.findUniqueOrThrow({ where: { id: trackId }, select: { repostCount: true } });
    return { reposted, repostCount: row.repostCount };
  });
}

/** Repost / un-repost a collection; same rules as tracks. */
export async function setCollectionRepost(
  db: PrismaClient,
  { userId, collectionId, reposted, caption, secret, now = clockNow() }: { userId: string; collectionId: string; reposted: boolean; caption?: string | null; secret?: string | null; now?: Date },
): Promise<{ reposted: boolean; repostCount: number }> {
  const { collection, access } = await visibleCollection(db, collectionId, userId, secret);
  if (collection.ownerId === userId) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't repost your own collection" });
  if (reposted && access !== "public") throw new TRPCError({ code: "BAD_REQUEST", message: "Private collections can't be liked or reposted" });
  await enforceRateLimit(db, "repost", userId, RATE_LIMITS.repostPerMinute);
  const text = caption?.trim().slice(0, CAPTION_MAX) || null;

  return db.$transaction(async (tx) => {
    let delta: number;
    if (reposted) {
      delta = (await tx.collectionRepost.createMany({ data: [{ userId, collectionId, caption: text, createdAt: now }], skipDuplicates: true })).count;
      if (delta) {
        await tx.activity.create({ data: { actorId: userId, type: "COLLECTION_REPOSTED", collectionId, createdAt: now } });
        await notify(tx, { recipientId: collection.ownerId, actorId: userId, type: "COLLECTION_REPOST", collectionId, now });
      }
    } else {
      delta = -(await tx.collectionRepost.deleteMany({ where: { userId, collectionId } })).count;
      if (delta) {
        await tx.activity.deleteMany({ where: { actorId: userId, type: "COLLECTION_REPOSTED", collectionId } });
        await unnotify(tx, { recipientId: collection.ownerId, actorId: userId, type: "COLLECTION_REPOST", collectionId });
      }
    }
    if (delta) await tx.$executeRaw`UPDATE "collection" SET "repostCount" = GREATEST(0, "repostCount" + ${delta}) WHERE "id" = ${collectionId}`;
    const row = await tx.collection.findUniqueOrThrow({ where: { id: collectionId }, select: { repostCount: true } });
    return { reposted, repostCount: row.repostCount };
  });
}
