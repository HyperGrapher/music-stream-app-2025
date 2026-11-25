import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Durable R2 delete queue (PRD 3.2, 18.1). Code that removes an asset row enqueues its object
 * keys in the same transaction; `drainStorageDeletions` (called from `after()` and the daily
 * cron) removes the objects. A lost `after()` therefore never leaks an object: the cron finds
 * the row later.
 */

/** Shared demo content that no code path may delete, even if a row for it is enqueued. */
export const PROTECTED_KEY_PREFIXES = ["demo/", "random-artwork-images/"] as const;

export const isProtectedKey = (key: string) =>
  PROTECTED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

type EnqueueDb = Pick<PrismaClient, "storageDeletion">;

export async function enqueueStorageDeletion(db: EnqueueDb, bucket: string, keys: string[]) {
  const unique = [...new Set(keys)].filter((key) => !isProtectedKey(key));
  if (unique.length === 0) return 0;
  const result = await db.storageDeletion.createMany({
    data: unique.map((key) => ({ bucket, key })),
    skipDuplicates: true,
  });
  return result.count;
}

export interface DrainResult {
  deleted: number;
  failed: number;
  remaining: number;
}

/** Deletes up to `limit` queued objects, oldest first. Failures stay queued with `attempts` + `lastError`. */
export async function drainStorageDeletions(
  db: Pick<PrismaClient, "storageDeletion">,
  r2: Pick<S3Client, "send">,
  { limit = 20, deadline }: { limit?: number; deadline?: number } = {},
): Promise<DrainResult> {
  const batch = await db.storageDeletion.findMany({
    orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let deleted = 0;
  let failed = 0;
  for (const row of batch) {
    if (deadline && Date.now() > deadline) break;
    try {
      // S3 and R2 answer 204 for a missing key, so a repeated delete is harmless.
      await r2.send(new DeleteObjectCommand({ Bucket: row.bucket, Key: row.key }));
      await db.storageDeletion.deleteMany({ where: { id: row.id } });
      deleted++;
    } catch (error) {
      failed++;
      await db.storageDeletion.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      });
    }
  }
  return { deleted, failed, remaining: await db.storageDeletion.count() };
}
