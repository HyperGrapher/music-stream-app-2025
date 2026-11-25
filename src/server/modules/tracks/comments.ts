import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";

import { canAccessTrack } from "./access";

export const COMMENT_MAX_LENGTH = 1000;
/** Posting limit per author, a cheap guard against spam floods. */
export const COMMENT_RATE_LIMIT = { max: 8, windowMs: 60_000 } as const;
/** Used only when a track's duration is unknown (analysis failed): matches the upload cap. */
const FALLBACK_MAX_SECONDS = 4 * 60 * 60;

const authorSelect = { select: { id: true, name: true, image: true } } as const;
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
  author: { id: string; name: string; image: string | null };
};

function toItem(row: CommentRow, trackCreatorId: string, viewer: Viewer) {
  return {
    id: row.id,
    content: row.content,
    timestampSeconds: row.timestampSeconds,
    parentId: row.parentId,
    createdAt: row.createdAt,
    author: row.author,
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

async function visibleTrack(db: PrismaClient, trackId: string, viewer: Viewer) {
  const track = await db.track.findUnique({
    where: { id: trackId },
    select: {
      creatorId: true,
      visibility: true,
      commentCount: true,
      audioAsset: { select: { audioAnalysis: { select: { durationMs: true } } } },
    },
  });
  if (!track || !canAccessTrack({ visibility: track.visibility, creatorId: track.creatorId }, viewer.id)) {
    return null;
  }
  return track;
}

/** Newest top-level comments first, each with its replies oldest first. Hidden tracks list nothing. */
export async function listComments(db: PrismaClient, trackId: string, viewer: Viewer) {
  const track = await visibleTrack(db, trackId, viewer);
  if (!track) return { comments: [], total: 0 };

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
  },
) {
  const track = await visibleTrack(db, input.trackId, { id: input.authorId });
  if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });

  if (input.timestampSeconds !== undefined) {
    if (input.parentId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Replies cannot have a timestamp" });
    }
    const durationMs = track.audioAsset.audioAnalysis?.durationMs;
    if (!validateTimestamp(input.timestampSeconds, durationMs)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Timestamp is outside the track" });
    }
  }

  const recent = await db.comment.count({
    where: {
      authorId: input.authorId,
      createdAt: { gte: new Date(Date.now() - COMMENT_RATE_LIMIT.windowMs) },
    },
  });
  if (recent >= COMMENT_RATE_LIMIT.max) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "You are commenting too fast" });
  }

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
      },
      select: commentSelect,
    });
    await tx.track.update({
      where: { id: input.trackId },
      data: { commentCount: { increment: 1 } },
    });
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
