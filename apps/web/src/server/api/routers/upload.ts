import { z } from "zod";
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TRPCError } from "@trpc/server";
import sanitizeFilename from "sanitize-filename";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { env } from "@/env";
import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";

// Maximum file size in bytes (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed audio mime types
const ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/flac',
    'audio/aac',
    'audio/m4a',
];

// Allowed image mime types
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
];

const optionalUrl = z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().url().optional(),
);

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

async function verifyUploadedAudio(bucket: string, storageKey: string) {
    try {
        const object = await r2Client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        }));

        if (!object.ContentLength || object.ContentLength > MAX_FILE_SIZE) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Uploaded file is empty or exceeds the maximum size",
            });
        }

        const contentType = object.ContentType
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();

        if (!contentType || !ALLOWED_AUDIO_TYPES.includes(contentType)) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Uploaded file has an unsupported audio type",
            });
        }
    } catch (error) {
        if (error instanceof TRPCError) throw error;

        console.error("Unable to verify uploaded audio object:", error);
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Uploaded audio file could not be verified",
            cause: error,
        });
    }
}

export const uploadRouter = createTRPCRouter({
    // Get a presigned URL for direct upload to R2
    getUploadUrl: protectedProcedure
        .input(z.object({
            filename: z.string().trim().min(1).max(255),
            contentType: z.string(),
            fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            if (!ALLOWED_AUDIO_TYPES.includes(input.contentType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Unsupported audio format. Please upload MP3, WAV, OGG, FLAC, or AAC files.",
                });
            }

            const fileKey = createStorageKey('uploads', userId, input.filename);

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

                const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
                const tempUpload = await db.tempTrackUpload.create({
                    data: {
                        id: crypto.randomUUID(),
                        userId,
                        isUploaded: false,
                        storage: 'cloudflare',
                        storageKey: fileKey,
                        bucket: env.R2_BUCKET_NAME,
                    },
                });

                return {
                    uploadUrl: presignedUrl,
                    tempUploadId: tempUpload.id,
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
        .input(z.object({
            filename: z.string().trim().min(1).max(255),
            contentType: z.string(),
            fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            if (!env.R2_PUBLIC_BASE_URL) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Artwork uploads require R2_PUBLIC_BASE_URL to be configured",
                });
            }

            // Validate the file type
            if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Unsupported image format. Please upload JPEG, PNG or WebP files.",
                });
            }

            try {
                // Generate a unique key for the artwork file
                const fileKey = createStorageKey('artworks', userId, input.filename);

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

                const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

                const publicBaseUrl = env.R2_PUBLIC_BASE_URL.endsWith("/")
                    ? env.R2_PUBLIC_BASE_URL
                    : `${env.R2_PUBLIC_BASE_URL}/`;
                const publicPath = fileKey
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/");
                const fileUrl = new URL(publicPath, publicBaseUrl).toString();

                return {
                    uploadUrl: presignedUrl,
                    fileUrl,
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
        .input(z.object({
            tempUploadId: z.string().uuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            try {
                const tempUpload = await db.tempTrackUpload.findFirst({
                    where: {
                        id: input.tempUploadId,
                        userId,
                    },
                });

                if (!tempUpload) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Upload not found",
                    });
                }

                // Claim the temporary row before touching storage. This prevents a
                // concurrent createTrack/createAlbum request from adopting the file.
                const claimed = await db.tempTrackUpload.deleteMany({
                    where: {
                        id: input.tempUploadId,
                        userId,
                    },
                });

                if (claimed.count !== 1) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Upload is already being finalized or canceled",
                    });
                }

                const deleteCommand = new DeleteObjectCommand({
                    Bucket: tempUpload.bucket,
                    Key: tempUpload.storageKey,
                });

                try {
                    await r2Client.send(deleteCommand);
                } catch (storageError) {
                    // Restore the claim so the user can retry cancellation instead
                    // of leaving the UI with an upload that can never be addressed.
                    try {
                        await db.tempTrackUpload.create({
                            data: {
                                id: tempUpload.id,
                                userId: tempUpload.userId,
                                isUploaded: tempUpload.isUploaded,
                                storageKey: tempUpload.storageKey,
                                storage: tempUpload.storage,
                                bucket: tempUpload.bucket,
                                createdAt: tempUpload.createdAt,
                            },
                        });
                    } catch (restoreError) {
                        console.error("Failed to restore upload after storage deletion error:", restoreError);
                    }

                    throw storageError;
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

    // Mark a temporary upload as completed
    markUploadComplete: protectedProcedure
        .input(z.object({
            tempUploadId: z.string().uuid(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            try {
                const tempUpload = await db.tempTrackUpload.findFirst({
                    where: {
                        id: input.tempUploadId,
                        userId,
                    },
                    select: {
                        storageKey: true,
                        bucket: true,
                    },
                });

                if (!tempUpload) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Upload not found",
                    });
                }

                await verifyUploadedAudio(tempUpload.bucket, tempUpload.storageKey);

                const updated = await db.tempTrackUpload.updateMany({
                    where: {
                        id: input.tempUploadId,
                        userId,
                    },
                    data: {
                        isUploaded: true,
                    },
                });

                if (updated.count !== 1) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Upload is no longer available",
                    });
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

    // Get track waveform data
    getWaveformData: publicProcedure
        .input(z.object({
            trackId: z.string(),
        }))
        .query(async ({ input }) => {
            try {
                // First get the track to ensure it exists and get the storageKey
                const track = await db.track.findUnique({
                    where: {
                        id: input.trackId,
                    },
                    select: {
                        id: true,
                        waveformData: true,
                    }
                });

                if (!track) {
                    throw new Error("Track not found");
                }

                // If waveform data already exists, return it
                if (track.waveformData) {
                    return {
                        waveformData: JSON.parse(track.waveformData),
                    };
                }

                // Otherwise, generate dummy waveform data
                // In a real app, you'd analyze the audio file to generate real waveform data
                // This could be done with a serverless function or external service
                const dummyWaveformData = generateDummyWaveformData();

                // Update the track with the waveform data
                await db.track.update({
                    where: {
                        id: input.trackId,
                    },
                    data: {
                        waveformData: JSON.stringify(dummyWaveformData),
                    }
                });

                return {
                    waveformData: dummyWaveformData,
                };
            } catch (error) {
                console.error("Error getting waveform data:", error);
                throw new Error("Failed to get waveform data");
            }
        }),

    // Create final track records from temporary uploads
    createTrack: protectedProcedure
        .input(z.object({
            title: z.string().trim().min(1).max(200),
            tempUploadId: z.string().uuid(),
            genre: z.string().trim().min(1).max(100),
            description: z.string().max(5000).optional(),
            privacy: z.enum(["public", "private"]),
            tags: z.string().max(1000).optional(),
            artwork: optionalUrl, // URL of uploaded artwork
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            try {
                // Extract audio metadata (like duration) - in a real implementation,
                // this might be done by a serverless function or webhook after upload
                // For now, we'll set a dummy duration
                const dummyDuration = 180; // 3 minutes in seconds

                // Generate dummy waveform data
                const dummyWaveformData = generateDummyWaveformData();

                const track = await db.$transaction(async (transaction) => {
                    const tempUpload = await transaction.tempTrackUpload.findFirst({
                        where: {
                            id: input.tempUploadId,
                            userId,
                            isUploaded: true,
                        },
                    });

                    if (!tempUpload) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: "Completed upload not found",
                        });
                    }

                    const claimed = await transaction.tempTrackUpload.deleteMany({
                        where: {
                            id: input.tempUploadId,
                            userId,
                            isUploaded: true,
                        },
                    });

                    if (claimed.count !== 1) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message: "Upload is already being finalized or canceled",
                        });
                    }

                    return transaction.track.create({
                        data: {
                            title: input.title,
                            storageKey: tempUpload.storageKey,
                            storage: tempUpload.storage,
                            bucket: tempUpload.bucket,
                            genre: input.genre,
                            description: input.description,
                            isPrivate: input.privacy !== "public",
                            tags: input.tags,
                            artworkUrl: input.artwork,
                            duration: dummyDuration,
                            waveformData: JSON.stringify(dummyWaveformData),
                            userId,
                        },
                    });
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

    // Create album with multiple tracks
    createAlbum: protectedProcedure
        .input(z.object({
            title: z.string().trim().min(1).max(200),
            tracks: z.array(z.object({
                tempUploadId: z.string().uuid(),
                title: z.string().trim().min(1).max(200),
            })).min(1).max(50),
            genre: z.string().trim().min(1).max(100),
            description: z.string().max(5000).optional(),
            privacy: z.enum(["public", "private"]),
            albumType: z.enum(["ALBUM", "EP"]),
            tags: z.string().max(1000).optional(),
            artwork: optionalUrl, // URL of uploaded artwork
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            try {
                const tempUploadIds = input.tracks.map((track) => track.tempUploadId);
                if (new Set(tempUploadIds).size !== tempUploadIds.length) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "Each uploaded file can only appear once in an album",
                    });
                }

                const album = await db.$transaction(async (transaction) => {
                    const tempUploads = await transaction.tempTrackUpload.findMany({
                        where: {
                            id: { in: tempUploadIds },
                            userId,
                            isUploaded: true,
                        },
                    });

                    if (tempUploads.length !== input.tracks.length) {
                        throw new TRPCError({
                            code: "NOT_FOUND",
                            message: "One or more completed uploads were not found",
                        });
                    }

                    const claimed = await transaction.tempTrackUpload.deleteMany({
                        where: {
                            id: { in: tempUploadIds },
                            userId,
                            isUploaded: true,
                        },
                    });

                    if (claimed.count !== input.tracks.length) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message: "One or more uploads are already being finalized or canceled",
                        });
                    }

                    const createdAlbum = await transaction.album.create({
                        data: {
                            title: input.title,
                            description: input.description,
                            type: input.albumType,
                            isPrivate: input.privacy === "private",
                            artworkUrl: input.artwork,
                            userId,
                        },
                    });

                    const uploadsById = new Map(
                        tempUploads.map((upload) => [upload.id, upload]),
                    );

                    for (const trackInput of input.tracks) {
                        const tempUpload = uploadsById.get(trackInput.tempUploadId)!;
                        await transaction.track.create({
                            data: {
                                title: trackInput.title,
                                storageKey: tempUpload.storageKey,
                                storage: tempUpload.storage,
                                bucket: tempUpload.bucket,
                                genre: input.genre,
                                description: input.description,
                                isPrivate: input.privacy === "private",
                                tags: input.tags,
                                artworkUrl: input.artwork,
                                duration: 180,
                                waveformData: JSON.stringify(generateDummyWaveformData()),
                                albumId: createdAlbum.id,
                                userId,
                            },
                        });
                    }

                    return createdAlbum;
                });

                return { album };
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error("Failed to create album:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create album record",
                    cause: error,
                });
            }
        }),

    // Delete temporary uploads that are older than 24 hours
    cleanupTemporaryUploads: protectedProcedure
        .mutation(async ({ ctx }) => {
            const userId = ctx.session.user.id;

            // Check if user is admin (you'd need to extend the user model for this)
            const isAdmin = false; // Replace with proper admin check
            if (!isAdmin) {
                throw new Error("Not authorized to perform this action");
            }

            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            try {
                // Get all expired temporary uploads
                const expiredUploads = await db.tempTrackUpload.findMany({
                    where: {
                        createdAt: {
                            lt: oneDayAgo,
                        },
                    },
                });

                let deletedCount = 0;

                // Delete each record and the corresponding file
                for (const upload of expiredUploads) {
                    try {
                        await db.tempTrackUpload.delete({
                            where: {
                                id: upload.id,
                            },
                        });

                        // Note: We don't have fileKey stored in the tempTrackUpload model
                        // In a real app, you'd store this or have a way to find the file

                        deletedCount++;
                    } catch (error) {
                        console.error(`Failed to delete temporary upload ${upload.id}:`, error);
                    }
                }

                return {
                    success: true,
                    deletedCount,
                };
            } catch (error) {
                console.error("Failed to clean up temporary uploads:", error);
                throw new Error("Failed to clean up temporary uploads");
            }
        }),

    // Get a download URL for an existing file
    getDownloadUrl: protectedProcedure
        .input(z.object({
            trackId: z.string().uuid(),
        }))
        .query(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            try {
                const track = await db.track.findFirst({
                    where: {
                        id: input.trackId,
                        userId,
                    },
                    select: {
                        storageKey: true,
                        bucket: true,
                    },
                });

                if (!track) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Track not found",
                    });
                }

                const command = new GetObjectCommand({
                    Bucket: track.bucket,
                    Key: track.storageKey,
                });

                const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

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

// Helper function to generate dummy waveform data
function generateDummyWaveformData(points = 100): number[] {
    const waveform = [];
    for (let i = 0; i < points; i++) {
        // Generate a value between 0.1 and 1.0 with some natural-looking variations
        const position = i / points;

        // Create a base pattern that's louder in the middle
        let value = 0.2 + 0.6 * Math.sin(position * Math.PI);

        // Add some random variation
        value += 0.2 * (Math.random() - 0.5);

        // Ensure value is between 0.1 and 1.0
        value = Math.max(0.1, Math.min(1.0, value));

        waveform.push(value);
    }
    return waveform;
}
