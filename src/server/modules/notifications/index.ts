import type { NotificationType, Prisma, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { utcDay } from "@/server/modules/stats";

type Tx = Pick<PrismaClient, "notification" | "notificationPreference" | "block">;

export interface NotifyInput {
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  trackId?: string | null;
  collectionId?: string | null;
  commentId?: string | null;
  message?: string | null;
  now?: Date;
}

/** `type:targetId:YYYY-MM-DD(UTC)`, the key notifications are grouped by at read time (NT-3). */
export function groupKeyOf(input: Pick<NotifyInput, "type" | "trackId" | "collectionId" | "commentId" | "actorId">, at: Date) {
  const target = input.commentId ?? input.trackId ?? input.collectionId ?? input.actorId ?? "none";
  return `${input.type}:${target}:${utcDay(at).toISOString().slice(0, 10)}`;
}

const targetWhere = (input: Pick<NotifyInput, "trackId" | "collectionId" | "commentId">): Prisma.NotificationWhereInput => ({
  trackId: input.trackId ?? null,
  collectionId: input.collectionId ?? null,
  commentId: input.commentId ?? null,
});

/**
 * Creates an in-app notification (NT-1). Never notifies yourself, never when the recipient blocked the
 * actor (NT-2), and respects the recipient's in-app preference. The same actor doing the same thing to
 * the same target notifies once, so like/unlike/like cannot spam. Returns whether a row was created.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<boolean> {
  const at = input.now ?? clockNow();
  if (input.actorId && input.actorId === input.recipientId) return false;
  if (input.actorId) {
    const blocked = await tx.block.findUnique({
      where: { blockerId_blockedId: { blockerId: input.recipientId, blockedId: input.actorId } },
      select: { blockerId: true },
    });
    if (blocked) return false;
  }
  const preference = await tx.notificationPreference.findUnique({
    where: { userId_type: { userId: input.recipientId, type: input.type } },
    select: { inApp: true },
  });
  if (preference && !preference.inApp) return false;
  // NEW_RELEASE is opt-in (NT-1): nothing is created unless the recipient turned it on.
  if (input.type === "NEW_RELEASE" && !preference?.inApp) return false;

  if (input.actorId) {
    const existing = await tx.notification.findFirst({
      where: { recipientId: input.recipientId, actorId: input.actorId, type: input.type, ...targetWhere(input) },
      select: { id: true },
    });
    if (existing) return false;
  }
  await tx.notification.create({
    data: {
      recipientId: input.recipientId,
      actorId: input.actorId,
      type: input.type,
      trackId: input.trackId ?? null,
      collectionId: input.collectionId ?? null,
      commentId: input.commentId ?? null,
      message: input.message ?? null,
      groupKey: groupKeyOf(input, at),
      createdAt: at,
    },
  });
  return true;
}

/** NT-4: undoing an action deletes the notification it caused, unless the recipient already read it. */
export async function unnotify(
  tx: Pick<PrismaClient, "notification">,
  input: Pick<NotifyInput, "recipientId" | "actorId" | "type" | "trackId" | "collectionId" | "commentId">,
) {
  await tx.notification.deleteMany({
    where: { recipientId: input.recipientId, actorId: input.actorId, type: input.type, readAt: null, ...targetWhere(input) },
  });
}

/**
 * NT-1 `NEW_RELEASE` (opt-in): a followed creator published an album, EP, single or compilation. Only followers
 * who switched the type on get a row, so the fan-out is as small as the opt-in list.
 */
export async function notifyNewRelease(
  tx: Tx & Pick<PrismaClient, "follow">,
  { creatorId, collectionId, now }: { creatorId: string; collectionId: string; now?: Date },
) {
  const optedIn = await tx.notificationPreference.findMany({
    where: { type: "NEW_RELEASE", inApp: true, user: { following: { some: { followingId: creatorId } }, status: "ACTIVE" } },
    select: { userId: true },
    take: 5000,
  });
  for (const { userId } of optedIn) await notify(tx, { recipientId: userId, actorId: creatorId, type: "NEW_RELEASE", collectionId, now });
}
