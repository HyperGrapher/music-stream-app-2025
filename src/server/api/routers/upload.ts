import { z } from "zod";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import {
  AudioAnalysisStatus,
  MediaKind,
  MediaStatus,
  Visibility,
  type Prisma,
  type MediaAsset,
} from "@/generated/prisma/client";
import sanitizeFilename from "sanitize-filename";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { env } from "@/env";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  buildPublicObjectUrl,
  isOwnedMediaAsset,
  normalizeObjectContentType,
  type MediaAssetKind,
} from "./upload-lifecycle";
import {
  clientAnalysisSchema,
  serializeWaveform,
  waveformStorageKey,
} from "@/server/modules/tracks/analysis";

// Maximum file size in bytes (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ARTWORK_FILE_SIZE = 10 * 1024 * 1024;
const UNATTACHED_ASSET_TTL_MS = 24 * 60 * 60 * 1000;

// Allowed audio mime types
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

// Allowed image mime types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

function createStorageKey(
  prefix: "uploads" | "artworks",
  userId: string,
  filename: string,
) {
  const safeFilename = sanitizeFilename(filename)
    .replace(/\s+/g, "_")
    .slice(0, 180);
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
) {
  try {
    const object = await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      }),
    );

    const maximumSize =
      kind === "audio" ? MAX_FILE_SIZE : MAX_ARTWORK_FILE_SIZE;
    if (!object.ContentLength || object.ContentLength > maximumSize) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Uploaded file is empty or exceeds the maximum size",
      });
    }

    const contentType = normalizeObjectContentType(object.ContentType);
    const allowedTypes =
      kind === "audio" ? ALLOWED_AUDIO_TYPES : ALLOWED_IMAGE_TYPES;

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

async function claimAndDeleteMediaAsset(upload: MediaAsset): Promise<boolean> {
  const generated =
    upload.kind === MediaKind.AUDIO
      ? await db.mediaAsset.findMany({
          where: {
            OR: [
              { overviewWaveformFor: { audioAssetId: upload.id } },
              { detailWaveformFor: { audioAssetId: upload.id } },
            ],
          },
        })
      : [];

  const claimed = await db.mediaAsset.updateMany({
    where: {
      id: upload.id,
      ownerId: upload.ownerId,
      status: {
        in: [MediaStatus.PENDING, MediaStatus.READY, MediaStatus.FAILED],
      },
    },
    data: { status: MediaStatus.DELETING },
  });

  if (claimed.count !== 1) return false;

  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: upload.bucket,
        Key: upload.storageKey,
      }),
    );
  } catch (storageError) {
    await db.mediaAsset.updateMany({
      where: { id: upload.id, status: MediaStatus.DELETING },
      data: { status: upload.status },
    });
    throw storageError;
  }

  await db.mediaAsset.delete({ where: { id: upload.id } });

  // Generated waveforms have no owner-facing lifecycle: they go with the audio.
  for (const waveform of generated) {
    try {
      await r2Client.send(
        new DeleteObjectCommand({ Bucket: waveform.bucket, Key: waveform.storageKey }),
      );
      await db.mediaAsset.delete({ where: { id: waveform.id } });
    } catch (error) {
      console.error(`Failed to delete waveform asset ${waveform.id}:`, error);
    }
  }

  return true;
}

async function cleanupExpiredUploadsForUser(userId: string) {
  const expiredUploads = await db.mediaAsset.findMany({
    where: {
      ownerId: userId,
      status: {
        in: [MediaStatus.PENDING, MediaStatus.READY, MediaStatus.FAILED],
      },
      expiresAt: { lt: new Date() },
    },
  });

  let deletedCount = 0;
  let failedCount = 0;

  for (const upload of expiredUploads) {
    try {
      if (await claimAndDeleteMediaAsset(upload)) deletedCount++;
    } catch (error) {
      failedCount++;
      console.error(`Failed to clean up media asset ${upload.id}:`, error);
    }
  }

  return { deletedCount, failedCount };
}

export const uploadRouter = createTRPCRouter({
  // Get a presigned URL for direct upload to R2
  getUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(255),
        contentType: z.string(),
        fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (!ALLOWED_AUDIO_TYPES.includes(input.contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Unsupported audio format. Please upload MP3, WAV, OGG, FLAC, or AAC files.",
        });
      }

      const fileKey = createStorageKey("uploads", userId, input.filename);

      try {
        const command = new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: fileKey,
          ContentType: input.contentType,
          // Add metadata
          Metadata: {
            userId,
            originalFilename: input.filename,
            uploadDate: new Date().toISOString(),
          },
        });

        const presignedUrl = await getSignedUrl(r2Client, command, {
          expiresIn: 3600,
        });
        const mediaAsset = await db.mediaAsset.create({
          data: {
            id: crypto.randomUUID(),
            ownerId: userId,
            kind: MediaKind.AUDIO,
            storageKey: fileKey,
            bucket: env.R2_BUCKET_NAME,
            originalFilename: input.filename,
            mimeType: input.contentType,
            expiresAt: new Date(Date.now() + UNATTACHED_ASSET_TTL_MS),
          },
        });

        return {
          uploadUrl: presignedUrl,
          mediaAssetId: mediaAsset.id,
        };
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

  // Get a presigned URL for artwork upload
  getArtworkUploadUrl: protectedProcedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(255),
        contentType: z.string(),
        fileSize: z.number().int().positive().max(MAX_ARTWORK_FILE_SIZE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Validate the file type
      if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Unsupported image format. Please upload JPEG, PNG or WebP files.",
        });
      }

      try {
        // Generate a unique key for the artwork file
        const fileKey = createStorageKey("artworks", userId, input.filename);

        // Create the presigned URL for upload
        const command = new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: fileKey,
          ContentType: input.contentType,
          // Add metadata
          Metadata: {
            userId,
            originalFilename: input.filename,
            uploadDate: new Date().toISOString(),
            isArtwork: "true",
          },
        });

        const presignedUrl = await getSignedUrl(r2Client, command, {
          expiresIn: 3600,
        });
        const mediaAsset = await db.mediaAsset.create({
          data: {
            id: crypto.randomUUID(),
            ownerId: userId,
            kind: MediaKind.IMAGE,
            storageKey: fileKey,
            bucket: env.R2_BUCKET_NAME,
            originalFilename: input.filename,
            mimeType: input.contentType,
            publicUrl: env.R2_PUBLIC_BASE_URL
              ? buildPublicObjectUrl(env.R2_PUBLIC_BASE_URL, fileKey)
              : null,
            expiresAt: new Date(Date.now() + UNATTACHED_ASSET_TTL_MS),
          },
        });

        return {
          uploadUrl: presignedUrl,
          mediaAssetId: mediaAsset.id,
        };
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

  // Cancel an upload and delete the file from R2 if it was uploaded
  cancelUpload: protectedProcedure
    .input(
      z.object({
        mediaAssetId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const mediaAsset = await db.mediaAsset.findFirst({
          where: {
            id: input.mediaAssetId,
            ownerId: userId,
          },
        });

        if (!mediaAsset) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Upload not found",
          });
        }

        if (!(await claimAndDeleteMediaAsset(mediaAsset))) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Upload is already being finalized or canceled",
          });
        }

        return {
          success: true,
          message: "Upload canceled and file deleted",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error canceling upload:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel upload",
          cause: error,
        });
      }
    }),

  // Mark a media asset as completed
  markUploadComplete: protectedProcedure
    .input(
      z.object({
        mediaAssetId: z.string().uuid(),
        /** Computed in the browser; omitted if the browser could not decode the file. */
        analysis: clientAnalysisSchema.optional(),
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
          select: {
            storageKey: true,
            bucket: true,
            originalFilename: true,
          },
        });

        if (!mediaAsset) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Upload not found",
          });
        }

        if (!isOwnedMediaAsset(mediaAsset.storageKey, "audio", userId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Media asset is not an audio file",
          });
        }

        const metadata = await verifyUploadedObject(
          mediaAsset.bucket,
          mediaAsset.storageKey,
          "audio",
        );

        const analysis = input.analysis;
        const waveformJson = analysis ? serializeWaveform(analysis) : null;
        const waveformKey = analysis
          ? waveformStorageKey(userId, input.mediaAssetId)
          : null;

        if (analysis && waveformKey) {
          await r2Client.send(
            new PutObjectCommand({
              Bucket: mediaAsset.bucket,
              Key: waveformKey,
              Body: waveformJson!,
              ContentType: "application/json",
            }),
          );
        }

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
                uploadedAt: new Date(),
              },
            });

            if (updated.count !== 1) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Upload is no longer available",
              });
            }

            if (!analysis || !waveformKey) {
              // Browser could not decode the file: keep the upload, no waveform.
              await transaction.audioAnalysis.create({
                data: {
                  audioAssetId: input.mediaAssetId,
                  status: AudioAnalysisStatus.FAILED,
                },
              });
              return;
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
                byteSize: BigInt(Buffer.byteLength(waveformJson!)),
                uploadedAt: new Date(),
                attachedAt: new Date(),
              },
            });
            await transaction.audioAnalysis.create({
              data: {
                audioAssetId: input.mediaAssetId,
                status: AudioAnalysisStatus.READY,
                durationMs: analysis.durationMs,
                sampleRate: analysis.sampleRate,
                channels: analysis.channels,
                overviewWaveformAssetId: waveformAsset.id,
                overviewPixelsPerSecond: 20,
                completedAt: new Date(),
              },
            });
          });
        } catch (error) {
          if (waveformKey) {
            await r2Client
              .send(
                new DeleteObjectCommand({
                  Bucket: mediaAsset.bucket,
                  Key: waveformKey,
                }),
              )
              .catch(() => undefined);
          }
          throw error;
        }

        return {
          success: true,
        };
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

  // Mark an owned temporary artwork upload as completed
  markArtworkUploadComplete: protectedProcedure
    .input(
      z.object({
        mediaAssetId: z.string().uuid(),
      }),
    )
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
          select: {
            storageKey: true,
            bucket: true,
          },
        });

        if (!mediaAsset) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Artwork upload not found",
          });
        }

        if (!isOwnedMediaAsset(mediaAsset.storageKey, "artwork", userId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Media asset is not artwork",
          });
        }

        const metadata = await verifyUploadedObject(
          mediaAsset.bucket,
          mediaAsset.storageKey,
          "artwork",
        );

        const updated = await db.mediaAsset.updateMany({
          where: {
            id: input.mediaAssetId,
            ownerId: userId,
            kind: MediaKind.IMAGE,
            status: MediaStatus.PENDING,
          },
          data: {
            status: MediaStatus.READY,
            byteSize: BigInt(metadata.byteSize),
            mimeType: metadata.mimeType,
            uploadedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Artwork upload is no longer available",
          });
        }

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

  // Create final track records from media assets
  createTrack: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        mediaAssetId: z.string().uuid(),
        genre: z.string().trim().min(1).max(100),
        description: z.string().max(5000).optional(),
        privacy: z.enum(["public", "private"]),
        tags: z.string().max(1000).optional(),
        artworkAssetId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const track = await db.$transaction(async (transaction) => {
          const mediaAsset = await transaction.mediaAsset.findFirst({
            where: {
              id: input.mediaAssetId,
              ownerId: userId,
              kind: MediaKind.AUDIO,
              status: MediaStatus.READY,
            },
          });

          if (!mediaAsset) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Completed upload not found",
            });
          }

          if (!isOwnedMediaAsset(mediaAsset.storageKey, "audio", userId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Completed upload is not an audio file",
            });
          }

          const claimed = await transaction.mediaAsset.updateMany({
            where: {
              id: input.mediaAssetId,
              ownerId: userId,
              kind: MediaKind.AUDIO,
              status: MediaStatus.READY,
            },
            data: {
              status: MediaStatus.ATTACHED,
              attachedAt: new Date(),
              expiresAt: null,
            },
          });

          if (claimed.count !== 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Upload is already being finalized or canceled",
            });
          }

          let artworkAssetId: string | undefined;
          if (input.artworkAssetId) {
            const artworkUpload = await transaction.mediaAsset.findFirst({
              where: {
                id: input.artworkAssetId,
                ownerId: userId,
                kind: MediaKind.IMAGE,
                status: MediaStatus.READY,
              },
            });

            if (!artworkUpload) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Completed artwork upload not found",
              });
            }

            if (
              !isOwnedMediaAsset(artworkUpload.storageKey, "artwork", userId)
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Completed artwork upload is not artwork",
              });
            }

            const artworkClaimed = await transaction.mediaAsset.updateMany({
              where: {
                id: input.artworkAssetId,
                ownerId: userId,
                kind: MediaKind.IMAGE,
                status: MediaStatus.READY,
              },
              data: {
                status: MediaStatus.ATTACHED,
                attachedAt: new Date(),
                expiresAt: null,
              },
            });

            if (artworkClaimed.count !== 1) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Artwork is already being finalized or canceled",
              });
            }

            artworkAssetId = artworkUpload.id;
          }

          const createdTrack = await transaction.track.create({
            data: {
              title: input.title,
              audioAssetId: mediaAsset.id,
              artworkAssetId,
              genre: input.genre,
              description: input.description,
              visibility:
                input.privacy === "public"
                  ? Visibility.PUBLIC
                  : Visibility.PRIVATE,
              tags:
                input.tags
                  ?.split(",")
                  .map((tag) => tag.trim())
                  .filter(Boolean) ?? [],
              creatorId: userId,
            },
          });

          return createdTrack;
        });

        return { track };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Failed to create track:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create track record",
          cause: error,
        });
      }
    }),

  // Publish an ordered release with multiple tracks
  createRelease: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).max(200),
        tracks: z
          .array(
            z.object({
              mediaAssetId: z.string().uuid(),
              title: z.string().trim().min(1).max(200),
            }),
          )
          .min(1)
          .max(50),
        genre: z.string().trim().min(1).max(100),
        description: z.string().max(5000).optional(),
        privacy: z.enum(["public", "private"]),
        releaseType: z.enum(["ALBUM", "EP"]),
        tags: z.string().max(1000).optional(),
        artworkAssetId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const mediaAssetIds = input.tracks.map((track) => track.mediaAssetId);
        if (new Set(mediaAssetIds).size !== mediaAssetIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Each uploaded file can only appear once in a release",
          });
        }

        const release = await db.$transaction(async (transaction) => {
          const mediaAssets = await transaction.mediaAsset.findMany({
            where: {
              id: { in: mediaAssetIds },
              ownerId: userId,
              kind: MediaKind.AUDIO,
              status: MediaStatus.READY,
            },
          });

          if (mediaAssets.length !== input.tracks.length) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "One or more completed uploads were not found",
            });
          }

          if (
            mediaAssets.some(
              (upload) =>
                !isOwnedMediaAsset(upload.storageKey, "audio", userId),
            )
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One or more completed uploads are not audio files",
            });
          }

          const claimed = await transaction.mediaAsset.updateMany({
            where: {
              id: { in: mediaAssetIds },
              ownerId: userId,
              kind: MediaKind.AUDIO,
              status: MediaStatus.READY,
            },
            data: {
              status: MediaStatus.ATTACHED,
              attachedAt: new Date(),
              expiresAt: null,
            },
          });

          if (claimed.count !== input.tracks.length) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "One or more uploads are already being finalized or canceled",
            });
          }

          let artworkAssetId: string | undefined;
          if (input.artworkAssetId) {
            const artworkUpload = await transaction.mediaAsset.findFirst({
              where: {
                id: input.artworkAssetId,
                ownerId: userId,
                kind: MediaKind.IMAGE,
                status: MediaStatus.READY,
              },
            });

            if (!artworkUpload) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Completed artwork upload not found",
              });
            }

            if (
              !isOwnedMediaAsset(artworkUpload.storageKey, "artwork", userId)
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Completed artwork upload is not artwork",
              });
            }

            const artworkClaimed = await transaction.mediaAsset.updateMany({
              where: {
                id: input.artworkAssetId,
                ownerId: userId,
                kind: MediaKind.IMAGE,
                status: MediaStatus.READY,
              },
              data: {
                status: MediaStatus.ATTACHED,
                attachedAt: new Date(),
                expiresAt: null,
              },
            });

            if (artworkClaimed.count !== 1) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Artwork is already being finalized or canceled",
              });
            }

            artworkAssetId = artworkUpload.id;
          }

          const createdRelease = await transaction.release.create({
            data: {
              title: input.title,
              description: input.description,
              type: input.releaseType,
              visibility:
                input.privacy === "public"
                  ? Visibility.PUBLIC
                  : Visibility.PRIVATE,
              artworkAssetId,
              creatorId: userId,
            },
          });

          const uploadsById = new Map(
            mediaAssets.map((upload) => [upload.id, upload]),
          );

          for (const [position, trackInput] of input.tracks.entries()) {
            const mediaAsset = uploadsById.get(trackInput.mediaAssetId)!;
            const createdTrack = await transaction.track.create({
              data: {
                title: trackInput.title,
                audioAssetId: mediaAsset.id,
                artworkAssetId,
                genre: input.genre,
                description: input.description,
                visibility:
                  input.privacy === "public"
                    ? Visibility.PUBLIC
                    : Visibility.PRIVATE,
                tags:
                  input.tags
                    ?.split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean) ?? [],
                creatorId: userId,
              },
            });
            await transaction.releaseTrack.create({
              data: {
                releaseId: createdRelease.id,
                trackId: createdTrack.id,
                position,
              },
            });
          }

          return createdRelease;
        });

        return { release };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Failed to create release:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create release",
          cause: error,
        });
      }
    }),

  // Delete media assets that are older than 24 hours
  cleanupMediaAssets: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    try {
      const result = await cleanupExpiredUploadsForUser(userId);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      console.error("Failed to clean up media assets:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to clean up media assets",
        cause: error,
      });
    }
  }),

  // Get a download URL for an existing file
  getDownloadUrl: protectedProcedure
    .input(
      z.object({
        trackId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const track = await db.track.findFirst({
          where: {
            id: input.trackId,
            creatorId: userId,
          },
          select: {
            audioAsset: {
              select: { storageKey: true, bucket: true },
            },
          },
        });

        if (!track) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Track not found",
          });
        }

        const command = new GetObjectCommand({
          Bucket: track.audioAsset.bucket,
          Key: track.audioAsset.storageKey,
        });

        const presignedUrl = await getSignedUrl(r2Client, command, {
          expiresIn: 3600,
        });

        return {
          downloadUrl: presignedUrl,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error generating download URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate download URL",
          cause: error,
        });
      }
    }),
});
