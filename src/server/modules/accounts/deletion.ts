import type { PrismaClient } from "@/generated/prisma/client";
import { imageObjectKeys } from "@/lib/artwork";
import { now as clockNow } from "@/server/clock";
import { recountCounters } from "@/server/modules/recount";
import { enqueueStorageDeletion } from "@/server/modules/storage/deletion";

const DAY = 86_400_000;
/** The account row (and so the username) is held this long after deletion, then the cron removes it. */
export const DELETED_ACCOUNT_RETENTION_DAYS = 30;

/**
 * Step 1 of account deletion (PRD AU-10), done synchronously: the account becomes DELETED (all its
 * content is hidden at once by the visibility builders), every session and sign-in method is
 * removed, and the email address is released.
 */
export async function markAccountDeleted(db: PrismaClient, userId: string, now: Date = clockNow()) {
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        email: `deleted-${userId}@deleted.invalid`,
        emailVerified: false,
        bio: null,
        city: null,
        image: null,
        updatedAt: now,
      },
    });
  });
}

/**
 * Step 2 (from `after()`, and by the daily cron for any DELETED account that still has content):
 * removes everything the user created, queues their R2 objects for deletion, then recomputes the
 * counters their rows contributed to (likes, reposts, comments, follows, collection totals).
 * The user row itself stays for 30 days so the username is not reused immediately.
 */
export async function purgeAccountContent(db: PrismaClient, userId: string) {
  await db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (user?.status !== "DELETED") throw new Error("purgeAccountContent only runs for deleted accounts");

      const assets = await tx.mediaAsset.findMany({ where: { ownerId: userId } });
      for (const asset of assets) {
        await enqueueStorageDeletion(tx, asset.bucket, asset.kind === "IMAGE" ? imageObjectKeys(asset) : [asset.storageKey]);
      }

      // Their comments on other people's tracks go, replies included (cascade via the parent).
      await tx.comment.deleteMany({ where: { authorId: userId } });
      await tx.trackLike.deleteMany({ where: { userId } });
      await tx.collectionLike.deleteMany({ where: { userId } });
      await tx.commentLike.deleteMany({ where: { userId } });
      await tx.trackRepost.deleteMany({ where: { userId } });
      await tx.collectionRepost.deleteMany({ where: { userId } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.notification.deleteMany({ where: { OR: [{ recipientId: userId }, { actorId: userId }] } });
      await tx.activity.deleteMany({ where: { actorId: userId } });
      await tx.spotlightItem.deleteMany({ where: { userId } });
      await tx.profileLink.deleteMany({ where: { userId } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.report.deleteMany({ where: { reporterId: userId } });
      await tx.message.deleteMany({ where: { senderId: userId } });
      await tx.conversationMember.deleteMany({ where: { userId } });
      // A conversation nobody belongs to any more has nothing left to show; the other person's side stays until they delete it.
      await tx.conversation.deleteMany({ where: { members: { none: {} } } });
      // Their tracks leave other users' playlists with them (collection_track cascades from the track).
      await tx.collection.deleteMany({ where: { ownerId: userId } });
      await tx.track.deleteMany({ where: { creatorId: userId } });
      await tx.user.update({
        where: { id: userId },
        data: { avatarAssetId: null, bannerAssetId: null, followerCount: 0, followingCount: 0, publicTrackCount: 0 },
      });
      await tx.mediaAsset.deleteMany({ where: { ownerId: userId } });
    },
    { timeout: 60_000 },
  );
  // Everything the removed rows contributed to is recomputed from the rows that are left.
  await recountCounters(db);
}

/** Daily cron: finish interrupted purges, then remove account rows past the retention period. */
export async function purgeDeletedAccounts(db: PrismaClient, now: Date = clockNow()) {
  const pending = await db.user.findMany({
    where: { status: "DELETED" },
    select: { id: true, updatedAt: true },
    take: 50,
  });
  let purged = 0;
  let removed = 0;
  for (const user of pending) {
    const hasContent =
      (await db.track.count({ where: { creatorId: user.id } })) +
        (await db.mediaAsset.count({ where: { ownerId: user.id } })) +
        (await db.collection.count({ where: { ownerId: user.id } })) >
      0;
    if (hasContent) {
      await purgeAccountContent(db, user.id);
      purged++;
    }
    if (user.updatedAt.getTime() < now.getTime() - DELETED_ACCOUNT_RETENTION_DAYS * DAY) {
      await db.user.delete({ where: { id: user.id } });
      removed++;
    }
  }
  return { purged, removed };
}
