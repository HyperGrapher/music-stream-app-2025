import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { bumpTrackDailyStat } from "@/server/modules/stats";
import { trackAccessSelect } from "@/server/modules/visibility";

import type { AccessParams } from "./access";
import { authorizeTrack } from "./authorize";
import { userAvatarUrl } from "./dto";

export const COMMENT_MAX_LENGTH = 1000;
/** Used only when a track's duration is unknown: matches the upload cap. */
const FALLBACK_MAX_SECONDS = 4 * 60 * 60;

const authorSelect = {
  select: {
    id: true,
    name: true,
    username: true,
    image: true,
    avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
  },
} as const;
const commentSelect = {
  id: true,
  content: true,
  timestampSeconds: true,
  parentId: true,
  createdAt: true,
  author: authorSelect,
} as const;

interface Viewer {
  id: string | null | undefined;
}

type CommentRow = {
  id: string;
  content: string;
  timestampSeconds: number | null;
  parentId: string | null;
  createdAt: Date;
  author: {
    id: string;
    name: string;
    username: string;
    image: string | null;
    avatarAsset: { id: string; publicUrl: string | null; imageWidths: number[] } | null;
  };
};

function toItem(row: CommentRow, trackCreatorId: string, viewer: Viewer) {
  const { avatarAsset: _avatar, ...author } = row.author;
  return {
    id: row.id,
    content: row.content,
    timestampSeconds: row.timestampSeconds,
    parentId: row.parentId,
    createdAt: row.createdAt,
    author: { ...author, image: userAvatarUrl(row.author) },
    isCreator: row.author.id === trackCreatorId,
    // Authors remove their own comments; the track's creator moderates their track.
    canDelete: !!viewer.id && (viewer.id === row.author.id || viewer.id === trackCreatorId),
  };
}

/** Whole seconds, inside the track. The end of the track itself is a valid moment. */
export function validateTimestamp(seconds: number, durationMs: number | null | undefined) {
  const max = durationMs ? Math.ceil(durationMs / 1000) : FALLBACK_MAX_SECONDS;
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= max;
}

/** Advisory-lock key serialising comment writes for one track (shared with the tests). */
export const commentLockKey = (trackId: string) => `comments:${trackId}`;

async function lockTrackComments(tx: Pick<PrismaClient, "$executeRaw">, trackId: string) {
  // Serialises create/delete per track so `commentCount` always equals the number of rows,
  // even when a thread is deleted while replies are being added.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${commentLockKey(trackId)}, 0))`;
}

async function visibleTrack(
  db: PrismaClient,
  trackId: string,
  viewer: Viewer,
  params: AccessParams | undefined,
  now: Date,
) {
  const track = await db.track.findUnique({
    where: { id: trackId },
    select: { ...trackAccessSelect, commentCount: true, commentsEnabled: true, durationMs: true },
  });
  if (!track) return null;
  const access = await authorizeTrack(db, track, { ...params, viewerId: viewer.id }, now);
  return access ? { ...track, access } : null;
}

/** Newest top-level comments first, each with its replies oldest first. Hidden tracks list nothing. */
export async function listComments(
  db: PrismaClient,
  trackId: string,
  viewer: Viewer,
  params?: AccessParams,
  now: Date = clockNow(),
) {
  const track = await visibleTrack(db, trackId, viewer, params, now);
  const owner = !!track && viewer.id === track.creatorId;
  // CM-5: with comments switched off only the owner still sees what was said.
  if (!track || (!track.commentsEnabled && !owner)) {
    return { comments: [], total: 0, commentsEnabled: track?.commentsEnabled ?? false };
  }

  const rows = await db.comment.findMany({
    where: { trackId, parentId: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      ...commentSelect,
      replies: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
        select: commentSelect,
      },
    },
  });

  return {
    total: track.commentCount,
    commentsEnabled: track.commentsEnabled,
    comments: rows.map(({ replies, ...row }) => ({
      ...toItem(row, track.creatorId, viewer),
      replies: replies.map((reply) => toItem(reply, track.creatorId, viewer)),
    })),
  };
}

export async function createComment(
  db: PrismaClient,
  input: {
    authorId: string;
    trackId: string;
    content: string;
    timestampSeconds?: number;
    parentId?: string;
    access?: AccessParams;
    now?: Date;
  },
) {
  const now = input.now ?? clockNow();
  const track = await visibleTrack(db, input.trackId, { id: input.authorId }, input.access, now);
  if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
  if (!track.commentsEnabled && track.creatorId !== input.authorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Comments are turned off for this track" });
  }

  if (input.timestampSeconds !== undefined) {
    if (input.parentId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Replies cannot have a timestamp" });
    }
    if (!validateTimestamp(input.timestampSeconds, track.durationMs)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Timestamp is outside the track" });
    }
  }

  await enforceRateLimit(db, "comment", input.authorId, RATE_LIMITS.commentPerMinute, RATE_LIMITS.commentPerDay);

  return db.$transaction(async (tx) => {
    await lockTrackComments(tx, input.trackId);

    // One level of replies: answering a reply attaches to the thread's root comment.
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await tx.comment.findUnique({
        where: { id: input.parentId },
        select: { trackId: true, parentId: true },
      });
      if (parent?.trackId !== input.trackId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      parentId = parent.parentId ?? input.parentId;
    }

    const row = await tx.comment.create({
      data: {
        authorId: input.authorId,
        trackId: input.trackId,
        content: input.content,
        timestampSeconds: input.timestampSeconds ?? null,
        parentId,
        createdAt: now,
      },
      select: commentSelect,
    });
    await tx.track.update({
      where: { id: input.trackId },
      data: { commentCount: { increment: 1 } },
    });
    await bumpTrackDailyStat(tx, input.trackId, "comments", 1, now);
    return toItem(row, track.creatorId, { id: input.authorId });
  });
}

export async function deleteComment(
  db: PrismaClient,
  { commentId, userId }: { commentId: string; userId: string },
) {
  return db.$transaction(async (tx) => {
    const found = await tx.comment.findUnique({
      where: { id: commentId },
      select: { trackId: true, authorId: true, track: { select: { creatorId: true } } },
    });
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
    if (userId !== found.authorId && userId !== found.track.creatorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete this comment" });
    }

    await lockTrackComments(tx, found.trackId);
    // Re-read under the lock: the comment (or its thread) may have changed while we waited.
    const comment = await tx.comment.findUnique({
      where: { id: commentId },
      select: { _count: { select: { replies: true } } },
    });
    if (!comment) return { removed: 0 };

    const removed = 1 + comment._count.replies; // replies go with their parent (cascade)
    await tx.comment.delete({ where: { id: commentId } });
    await tx.$executeRaw`UPDATE "track" SET "commentCount" = GREATEST(0, "commentCount" - ${removed}) WHERE "id" = ${found.trackId}`;
    return { removed };
  });
}
