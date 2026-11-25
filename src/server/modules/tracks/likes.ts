import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Relation select that tells, per track, whether the viewer liked it. Anonymous viewers
 * match nothing (user ids are never empty), so every query can include it unconditionally.
 */
export function likedByMeSelect(viewerId: string | null | undefined) {
  return {
    likes: { where: { userId: viewerId ?? "" }, select: { userId: true }, take: 1 },
  } as const;
}

/**
 * Idempotent like / unlike. `Track.likeCount` only moves when a `TrackLike` row is actually
 * inserted or deleted (inside one transaction), so repeats, double clicks and concurrent
 * requests cannot drift the counter away from the rows it summarises.
 */
export async function setTrackLike(
  db: PrismaClient,
  { userId, trackId, liked }: { userId: string; trackId: string; liked: boolean },
): Promise<{ liked: boolean; likeCount: number }> {
  return db.$transaction(async (tx) => {
    const delta = liked
      ? (await tx.trackLike.createMany({ data: [{ userId, trackId }], skipDuplicates: true })).count
      : -(await tx.trackLike.deleteMany({ where: { userId, trackId } })).count;

    const track = delta
      ? await tx.track.update({
          where: { id: trackId },
          data: { likeCount: { increment: delta } },
          select: { likeCount: true },
        })
      : await tx.track.findUniqueOrThrow({ where: { id: trackId }, select: { likeCount: true } });

    return { liked, likeCount: track.likeCount };
  });
}
