import type { S3Client } from "@aws-sdk/client-s3";

import type { PrismaClient } from "@/generated/prisma/client";
import { imageObjectKeys } from "@/lib/artwork";
import { now as clockNow } from "@/server/clock";
import { purgeDeletedAccounts } from "@/server/modules/accounts/deletion";
import { pruneEmailBodies } from "@/server/modules/email";
import { pruneRateLimitBuckets } from "@/server/modules/rate-limit";
import { drainStorageDeletions, enqueueStorageDeletion } from "@/server/modules/storage/deletion";
import { waveformStorageKey } from "@/server/modules/tracks/analysis";

const DAY_MS = 86_400_000;

/**
 * Unattached uploads past `expiresAt` (24 h): claim them (PENDING/READY/FAILED -> DELETING, so a
 * concurrent publish cannot win), queue their objects for deletion and drop the rows. Waveforms
 * generated for an audio asset go with it.
 */
export async function expireUnattachedAssets(db: PrismaClient, at: Date, limit = 200) {
  const expired = await db.mediaAsset.findMany({
    where: { status: { in: ["PENDING", "READY", "FAILED"] }, expiresAt: { lt: at } },
    take: limit,
  });
  let removed = 0;
  for (const asset of expired) {
    const claimed = await db.mediaAsset.updateMany({
      where: { id: asset.id, status: { in: ["PENDING", "READY", "FAILED"] } },
      data: { status: "DELETING" },
    });
    if (claimed.count !== 1) continue;
    await removeAssetRows(db, [asset.id]);
    removed++;
  }
  return removed;
}

/**
 * Deletes asset rows and queues every object behind them (all image renditions, the waveform of an
 * audio asset) in one transaction. Callers must have claimed the rows (status DELETING) first.
 */
export async function removeAssetRows(db: PrismaClient, assetIds: string[]) {
  await db.$transaction(async (tx) => {
    const assets = await tx.mediaAsset.findMany({
      where: { id: { in: assetIds } },
      include: { audioAnalysis: { include: { overviewWaveformAsset: true } } },
    });
    for (const asset of assets) {
      const keys = asset.kind === "IMAGE" ? imageObjectKeys(asset) : [asset.storageKey];
      await enqueueStorageDeletion(tx, asset.bucket, keys);
      const waveform = asset.audioAnalysis?.overviewWaveformAsset;
      if (waveform) {
        await enqueueStorageDeletion(tx, waveform.bucket, [waveform.storageKey]);
        await tx.mediaAsset.deleteMany({ where: { id: waveform.id } });
      } else if (asset.kind === "AUDIO") {
        // Waveform written before the analysis row existed (publish failed midway).
        await enqueueStorageDeletion(tx, asset.bucket, [waveformStorageKey(asset.ownerId, asset.id)]);
      }
    }
    await tx.mediaAsset.deleteMany({ where: { id: { in: assetIds } } });
  });
}

export interface DailyReport {
  expiredAssets: number;
  storage: { deleted: number; failed: number; remaining: number };
  rateLimitBuckets: number;
  emailBodies: number;
  playEvents: number;
  usernameRedirects: number;
  accounts: { purged: number; removed: number };
}

/**
 * The one daily cron job (Vercel Hobby runs crons at most once per day, so nothing time-critical
 * lives here). Every task is idempotent and bounded; later milestones add account purges,
 * notification digests and chart snapshots to this list (PRD BG-1).
 */
export async function runDailyHousekeeping(
  db: PrismaClient,
  r2: Pick<S3Client, "send">,
  at: Date = clockNow(),
): Promise<DailyReport> {
  const deadline = Date.now() + 40_000;
  const expiredAssets = await expireUnattachedAssets(db, at);
  // Before draining: purging a deleted account queues its R2 objects.
  const accounts = await purgeDeletedAccounts(db, at);
  const storage = await drainStorageDeletions(db, r2, { limit: 200, deadline });
  const rateLimitBuckets = await pruneRateLimitBuckets(db, at);
  const emailBodies = await pruneEmailBodies(db, at);
  const playEvents = (
    await db.playEvent.deleteMany({
      where: { createdAt: { lt: new Date(at.getTime() - 396 * DAY_MS) } },
    })
  ).count;
  const usernameRedirects = (
    await db.usernameRedirect.deleteMany({ where: { createdAt: { lt: new Date(at.getTime() - 30 * DAY_MS) } } })
  ).count;
  return { expiredAssets, storage, rateLimitBuckets, emailBodies, playEvents, usernameRedirects, accounts };
}
