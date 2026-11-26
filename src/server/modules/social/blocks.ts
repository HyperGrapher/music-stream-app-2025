import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { userAvatarUrl } from "@/server/modules/tracks/dto";

/**
 * Block / unblock (PRD BL-1). Blocking removes follows in both directions (counters adjusted by the rows actually
 * deleted, same transaction) and drops unread notifications the blocked user caused. It is not a privacy wall: public
 * pages stay reachable. The other effects are enforced where the content is read (comments, feed, search, related).
 */
export async function setBlock(db: PrismaClient, { blockerId, blockedId, blocked, now = clockNow() }: { blockerId: string; blockedId: string; blocked: boolean; now?: Date }) {
  if (blockerId === blockedId) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't block yourself" });
  const target = await db.user.findUnique({ where: { id: blockedId }, select: { status: true, role: true } });
  if (target?.status !== "ACTIVE") throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

  return db.$transaction(async (tx) => {
    if (!blocked) {
      await tx.block.deleteMany({ where: { blockerId, blockedId } });
      return { blocked: false };
    }
    await tx.block.createMany({ data: [{ blockerId, blockedId, createdAt: now }], skipDuplicates: true });
    const removed = await tx.follow.findMany({ where: { OR: [{ followerId: blockerId, followingId: blockedId }, { followerId: blockedId, followingId: blockerId }] }, select: { followerId: true, followingId: true } });
    for (const { followerId, followingId } of removed) {
      await tx.follow.delete({ where: { followerId_followingId: { followerId, followingId } } });
      await tx.$executeRaw`UPDATE "user" SET "followerCount" = GREATEST(0, "followerCount" - 1) WHERE "id" = ${followingId}`;
      await tx.$executeRaw`UPDATE "user" SET "followingCount" = GREATEST(0, "followingCount" - 1) WHERE "id" = ${followerId}`;
    }
    await tx.notification.deleteMany({ where: { recipientId: blockerId, actorId: blockedId, readAt: null } });
    return { blocked: true };
  });
}

/** BL-2: the people you blocked, newest first. */
export async function listBlocked(db: PrismaClient, userId: string) {
  const rows = await db.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { createdAt: true, blocked: { select: { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } } } },
  });
  return rows.map((r) => ({ at: r.createdAt, id: r.blocked.id, name: r.blocked.name, username: r.blocked.username, image: userAvatarUrl(r.blocked) }));
}

/** Everyone the viewer blocked or who blocked the viewer (hidden from search, related, feeds). Empty for anonymous viewers. */
export async function blockedEitherWay(db: Pick<PrismaClient, "block">, viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await db.block.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true }, take: 5000 });
  return new Set(rows.flatMap((r) => [r.blockerId, r.blockedId]).filter((id) => id !== viewerId));
}
