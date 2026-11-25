import type { S3Client } from "@aws-sdk/client-s3";

import type { PrismaClient } from "@/generated/prisma/client";
import { buildPublicObjectUrl } from "@/server/api/routers/upload-lifecycle";
import { deleteObjects, processArtworkObject } from "./artwork-processing";

export interface BackfillResult {
  processed: { id: string; from: string; to: string; widths: number[]; sourceDeleted: boolean }[];
  failed: { id: string; storageKey: string; error: string }[];
}

/**
 * Converts image assets uploaded before artwork processing existed (no `imageWidths`) into
 * renditions, like a new upload. The source object is deleted only when it is the owner's own
 * upload (`artworks/<ownerId>/...`); shared sources such as the demo pool
 * (`random-artwork-images/`) are left in place because other assets or the seed may use them.
 * Idempotent: processed assets are skipped, and rendition keys derive from the asset id.
 */
export async function backfillArtwork(
  db: PrismaClient,
  r2: S3Client,
  options: { publicBaseUrl?: string; dryRun?: boolean } = {},
): Promise<BackfillResult> {
  const assets = await db.mediaAsset.findMany({
    where: { kind: "IMAGE", imageWidths: { isEmpty: true }, status: { in: ["READY", "ATTACHED"] } },
    select: { id: true, ownerId: true, bucket: true, storageKey: true },
    orderBy: { createdAt: "asc" },
  });
  const result: BackfillResult = { processed: [], failed: [] };

  for (const asset of assets) {
    if (options.dryRun) {
      result.processed.push({ id: asset.id, from: asset.storageKey, to: "(dry run)", widths: [], sourceDeleted: false });
      continue;
    }
    try {
      const processed = await processArtworkObject(r2, {
        bucket: asset.bucket,
        sourceKey: asset.storageKey,
        base: `artworks/${asset.ownerId}/${asset.id}`,
      });
      const updated = await db.mediaAsset.updateMany({
        where: { id: asset.id, storageKey: asset.storageKey, imageWidths: { isEmpty: true } },
        data: {
          storageKey: processed.storageKey,
          imageWidths: processed.imageWidths,
          byteSize: BigInt(processed.byteSize),
          mimeType: processed.mimeType,
          publicUrl: options.publicBaseUrl
            ? buildPublicObjectUrl(options.publicBaseUrl, processed.storageKey)
            : null,
        },
      });
      const ownUpload = asset.storageKey.startsWith(`artworks/${asset.ownerId}/`);
      const sourceDeleted = updated.count === 1 && ownUpload;
      if (sourceDeleted) await deleteObjects(r2, asset.bucket, [asset.storageKey]);
      result.processed.push({
        id: asset.id,
        from: asset.storageKey,
        to: processed.storageKey,
        widths: processed.imageWidths,
        sourceDeleted,
      });
    } catch (error) {
      result.failed.push({
        id: asset.id,
        storageKey: asset.storageKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
