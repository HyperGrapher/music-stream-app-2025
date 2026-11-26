import { z } from "zod";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import { MediaKind, MediaStatus, type MediaAsset } from "@/generated/prisma/client";
import sanitizeFilename from "sanitize-filename";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { env } from "@/env";
import { createTRPCRouter, protectedProcedure, verifiedProcedure } from "@/server/api/trpc";
import {
  buildPublicObjectUrl,
  IMAGE_BASE_PREFIX,
  isOwnedImage,
  isOwnedMediaAsset,
  normalizeObjectContentType,
  type MediaAssetKind,
} from "./upload-lifecycle";
import {
  clientAnalysisSchema,
  serializeWaveform,
  waveformStorageKey,
} from "@/server/modules/tracks/analysis";
import {
  InvalidArtworkError,
  processImageObject,
  type ProcessedArtwork,
} from "@/server/modules/media/artwork-processing";
import { runAfter } from "@/server/after";
import { now } from "@/server/clock";
import { removeAssetRows } from "@/server/modules/housekeeping";
import { getEntitlements } from "@/server/modules/plans/entitlements";
import { enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { publishCollection, publishTrack } from "@/server/modules/publishing";
import { drainStorageDeletions } from "@/server/modules/storage/deletion";
import { trackPermalink } from "@/server/modules/tracks/dto";

const MAX_ARTWORK_FILE_SIZE = 10 * 1024 * 1024;
const UNATTACHED_ASSET_TTL_MS = 24 * 60 * 60 * 1000;

// Accepted audio formats. Deliberately the formats the app already supported (owner decision:
// no new formats for now); MP3 is the reference format.
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/m4a",
];

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const imagePurposeSchema = z.enum(["ARTWORK", "AVATAR", "BANNER"]);

function createStorageKey(prefix: "uploads" | "artworks", userId: string, filename: string) {
  const safeFilename = sanitizeFilename(filename).replace(/\s+/g, "_").slice(0, 180);
  if (!safeFilename) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Filename must contain at least one valid character",
    });
  }

  return `${prefix}/${userId}/${crypto.randomUUID()}-${safeFilename}`;
}

async function verifyUploadedObject(
  bucket: string,
  storageKey: string,
  kind: MediaAssetKind,
  maxAudioBytes: number,
) {
  try {
    const object = await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));

    const maximumSize = kind === "audio" ? maxAudioBytes : MAX_ARTWORK_FILE_SIZE;
    if (!object.ContentLength || object.ContentLength > maximumSize) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Uploaded file is empty or exceeds the maximum size",
      });
    }

    const contentType = normalizeObjectContentType(object.ContentType);
    const allowedTypes = kind === "audio" ? ALLOWED_AUDIO_TYPES : ALLOWED_IMAGE_TYPES;

    if (!contentType || !allowedTypes.includes(contentType)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Uploaded file has an unsupported ${kind} type`,
      });
    }

    return { byteSize: object.ContentLength, mimeType: contentType };
  } catch (error) {
    if (error instanceof TRPCError) throw error;

    console.error(`Unable to verify uploaded ${kind} object:`, error);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Uploaded ${kind} file could not be verified`,
      cause: error,
    });
  }
}

/** Claims an unattached asset (-> DELETING, so a concurrent publish cannot win) and queues its objects for deletion. */
async function claimAndDeleteMediaAsset(upload: MediaAsset): Promise<boolean> {
  const claimed = await db.mediaAsset.updateMany({
    where: {
      id: upload.id,
      ownerId: upload.ownerId,
      status: { in: [MediaStatus.PENDING, MediaStatus.READY, MediaStatus.FAILED] },
    },
    data: { status: MediaStatus.DELETING },
  });
  if (claimed.count !== 1) return false;

  await removeAssetRows(db, [upload.id]);
  runAfter(() => drainStorageDeletions(db, r2Client, { limit: 20 }));
  return true;
}

const trackFields = {
  title: z.string().trim().min(1).max(100),
  artistName: z.string().trim().max(100).optional(),
  genre: z.string().trim().min(1).max(100),
  description: z.string().max(4000).optional(),
  privacy: z.enum(["public", "private"]),
  tags: z.string().max(1000).optional(),
  artworkAssetId: z.string().uuid().optional(),
};

const splitTags = (tags: string | undefined) => tags?.split(",") ?? [];

export const uploadRouter = createTRPCRouter({
  // Get a presigned URL for direct upload to R2
  getUploadUrl: verifiedProcedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(255),
        contentType: z.string(),
        fileSize: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (!ALLOWED_AUDIO_TYPES.includes(input.contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported audio format. Please upload MP3, WAV, OGG, FLAC, or AAC files.",
        });
      }
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
      if (input.fileSize > getEntitlements(user).maxFileBytes) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File is too large" });
      }
      await enforceRateLimit(db, "upload-url", userId, RATE_LIMITS.uploadUrlPerMinute, RATE_LIMITS.uploadUrlPerDay);

      const fileKey = createStorageKey("uploads", userId, input.filename);

      try {
        const command = new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: fileKey,
          ContentType: input.contentType,
          Metadata: {
            userId,
            originalFilename: input.filename,
            uploadDate: now().toISOString(),
          },
        });

        const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
        const mediaAsset = await db.mediaAsset.create({
          data: {
            id: crypto.randomUUID(),
            ownerId: userId,
            kind: MediaKind.AUDIO,
            storageKey: fileKey,
            bucket: env.R2_BUCKET_NAME,
            originalFilename: input.filename,
            mimeType: input.contentType,
            expiresAt: new Date(now().getTime() + UNATTACHED_ASSET_TTL_MS),
          },
        });

        return { uploadUrl: presignedUrl, mediaAssetId: mediaAsset.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error generating presigned URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to prepare upload",
          cause: error,
        });
      }
    }),

  // Get a presigned URL for an image upload (artwork, avatar or banner)
  getArtworkUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(255),
        contentType: z.string(),
        fileSize: z.number().int().positive().max(MAX_ARTWORK_FILE_SIZE),
        purpose: imagePurposeSchema.default("ARTWORK"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unsupported image format. Please upload JPEG, PNG or WebP files.",
        });
      }
      await enforceRateLimit(db, "upload-url", userId, RATE_LIMITS.uploadUrlPerMinute, RATE_LIMITS.uploadUrlPerDay);

      try {
        const fileKey = createStorageKey("artworks", userId, input.filename);
        const command = new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: fileKey,
          ContentType: input.contentType,
          Metadata: {
            userId,
            originalFilename: input.filename,
            uploadDate: now().toISOString(),
            purpose: input.purpose,
          },
        });

        const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
        const mediaAsset = await db.mediaAsset.create({
          data: {
            id: crypto.randomUUID(),
            ownerId: userId,
            kind: MediaKind.IMAGE,
            imagePurpose: input.purpose,
            storageKey: fileKey,
            bucket: env.R2_BUCKET_NAME,
            originalFilename: input.filename,
            mimeType: input.contentType,
            publicUrl: env.R2_PUBLIC_BASE_URL
              ? buildPublicObjectUrl(env.R2_PUBLIC_BASE_URL, fileKey)
              : null,
            expiresAt: new Date(now().getTime() + UNATTACHED_ASSET_TTL_MS),
          },
        });

        return { uploadUrl: presignedUrl, mediaAssetId: mediaAsset.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error generating artwork upload URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate artwork upload URL",
          cause: error,
        });
      }
    }),

  // Cancel an upload and queue its file for deletion
  cancelUpload: protectedProcedure
    .input(z.object({ mediaAssetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const mediaAsset = await db.mediaAsset.findFirst({
        where: { id: input.mediaAssetId, ownerId: ctx.session.user.id },
      });
      if (!mediaAsset) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });

      if (!(await claimAndDeleteMediaAsset(mediaAsset))) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Upload is already being finalized or canceled",
        });
      }
      return { success: true, message: "Upload canceled and file deleted" };
    }),

  // Verify the uploaded audio, store its waveform and mark the asset READY.
  markUploadComplete: verifiedProcedure
    .input(
      z.object({
        mediaAssetId: z.string().uuid(),
        /** Computed in the browser. Required: a file the browser cannot decode is rejected (UP-F2). */
        analysis: clientAnalysisSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const mediaAsset = await db.mediaAsset.findFirst({
          where: {
            id: input.mediaAssetId,
            ownerId: userId,
            kind: MediaKind.AUDIO,
            status: MediaStatus.PENDING,
          },
          select: { storageKey: true, bucket: true, originalFilename: true },
        });

        if (!mediaAsset) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
        }
        if (!isOwnedMediaAsset(mediaAsset.storageKey, "audio", userId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Media asset is not an audio file" });
        }

        const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
        const metadata = await verifyUploadedObject(
          mediaAsset.bucket,
          mediaAsset.storageKey,
          "audio",
          getEntitlements(user).maxFileBytes,
        );

        const analysis = input.analysis;
        const waveformJson = serializeWaveform(analysis);
        const waveformKey = waveformStorageKey(userId, input.mediaAssetId);

        await r2Client.send(
          new PutObjectCommand({
            Bucket: mediaAsset.bucket,
            Key: waveformKey,
            Body: waveformJson,
            ContentType: "application/json",
          }),
        );

        try {
          await db.$transaction(async (transaction) => {
            const updated = await transaction.mediaAsset.updateMany({
              where: {
                id: input.mediaAssetId,
                ownerId: userId,
                kind: MediaKind.AUDIO,
                status: MediaStatus.PENDING,
              },
              data: {
                status: MediaStatus.READY,
                byteSize: BigInt(metadata.byteSize),
                mimeType: metadata.mimeType,
                uploadedAt: now(),
              },
            });
            if (updated.count !== 1) {
              throw new TRPCError({ code: "CONFLICT", message: "Upload is no longer available" });
            }

            const waveformAsset = await transaction.mediaAsset.create({
              data: {
                ownerId: userId,
                kind: MediaKind.WAVEFORM,
                status: MediaStatus.ATTACHED,
                bucket: mediaAsset.bucket,
                storageKey: waveformKey,
                originalFilename: "overview.json",
                mimeType: "application/json",
                byteSize: BigInt(Buffer.byteLength(waveformJson)),
                uploadedAt: now(),
                attachedAt: now(),
              },
            });
            await transaction.audioAnalysis.create({
              data: {
                audioAssetId: input.mediaAssetId,
                status: "READY",
                durationMs: analysis.durationMs,
                sampleRate: analysis.sampleRate,
                channels: analysis.channels,
                overviewWaveformAssetId: waveformAsset.id,
                overviewPixelsPerSecond: 20,
                completedAt: now(),
              },
            });
          });
        } catch (error) {
          await r2Client
            .send(new DeleteObjectCommand({ Bucket: mediaAsset.bucket, Key: waveformKey }))
            .catch(() => undefined);
          throw error;
        }

        return { success: true, durationMs: analysis.durationMs };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error marking upload as complete:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to mark upload as complete",
          cause: error,
        });
      }
    }),

  // Verify an uploaded image and turn it into WebP renditions (artwork, avatar or banner).
  markArtworkUploadComplete: protectedProcedure
    .input(z.object({ mediaAssetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const mediaAsset = await db.mediaAsset.findFirst({
          where: {
            id: input.mediaAssetId,
            ownerId: userId,
            kind: MediaKind.IMAGE,
            status: MediaStatus.PENDING,
          },
          select: { storageKey: true, bucket: true, imagePurpose: true },
        });

        if (!mediaAsset) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Artwork upload not found" });
        }
        if (!isOwnedImage(mediaAsset.storageKey, userId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Media asset is not an image" });
        }

        await verifyUploadedObject(mediaAsset.bucket, mediaAsset.storageKey, "artwork", 0);

        // Renditions replace the original, which is then deleted.
        const purpose = mediaAsset.imagePurpose ?? "ARTWORK";
        let processed: ProcessedArtwork;
        try {
          processed = await processImageObject(r2Client, {
            bucket: mediaAsset.bucket,
            sourceKey: mediaAsset.storageKey,
            base: `${IMAGE_BASE_PREFIX[purpose]}/${userId}/${input.mediaAssetId}`,
            purpose,
          });
        } catch (error) {
          if (error instanceof InvalidArtworkError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The artwork could not be read as an image",
              cause: error,
            });
          }
          throw error;
        }

        const updated = await db.mediaAsset.updateMany({
          where: {
            id: input.mediaAssetId,
            ownerId: userId,
            kind: MediaKind.IMAGE,
            status: MediaStatus.PENDING,
            storageKey: mediaAsset.storageKey,
          },
          data: {
            status: MediaStatus.READY,
            storageKey: processed.storageKey,
            imageWidths: processed.imageWidths,
            byteSize: BigInt(processed.byteSize),
            mimeType: processed.mimeType,
            publicUrl: env.R2_PUBLIC_BASE_URL
              ? buildPublicObjectUrl(env.R2_PUBLIC_BASE_URL, processed.storageKey)
              : null,
            uploadedAt: now(),
          },
        });

        if (updated.count !== 1) {
          // A concurrent call for the same upload won (and wrote the same rendition keys), or the
          // upload expired meanwhile. Leave the objects to whichever asset now owns them.
          throw new TRPCError({
            code: "CONFLICT",
            message: "Artwork upload is no longer available",
          });
        }

        await db.storageDeletion.createMany({
          data: [{ bucket: mediaAsset.bucket, key: mediaAsset.storageKey }],
          skipDuplicates: true,
        });
        runAfter(() => drainStorageDeletions(db, r2Client, { limit: 20 }));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error marking artwork upload as complete:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to mark artwork upload as complete",
          cause: error,
        });
      }
    }),

  // Publish one uploaded file as a track
  createTrack: verifiedProcedure
    .input(z.object({ mediaAssetId: z.string().uuid(), ...trackFields }))
    .mutation(async ({ ctx, input }) => {
      const { tags, ...rest } = input;
      const track = await publishTrack(ctx.db, ctx.session.user.id, { ...rest, tags: splitTags(tags) });
      const username = ctx.session.user.username!;
      return {
        track: { id: track.id, slug: track.slug },
        permalink: trackPermalink({ slug: track.slug, creator: { username } }),
      };
    }),

  // Publish several uploaded files as one collection (album, EP, ...)
  createCollection: verifiedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(100),
        type: z.enum(["ALBUM", "EP", "SINGLE", "COMPILATION", "PLAYLIST"]).default("ALBUM"),
        tracks: z
          .array(
            z.object({
              mediaAssetId: z.string().uuid(),
              title: z.string().trim().min(1).max(100),
            }),
          )
          .min(1)
          .max(100),
        genre: z.string().trim().min(1).max(100),
        description: z.string().max(4000).optional(),
        privacy: z.enum(["public", "private"]),
        tags: z.string().max(1000).optional(),
        artworkAssetId: z.string().uuid().optional(),
        releaseDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tags, ...rest } = input;
      const collection = await publishCollection(ctx.db, ctx.session.user.id, {
        ...rest,
        tags: splitTags(tags),
      });
      const username = ctx.session.user.username!;
      return {
        collection: { id: collection.id, slug: collection.slug },
        permalink: `/${username}/sets/${collection.slug}`,
      };
    }),
});
