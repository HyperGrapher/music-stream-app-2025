import { z } from "zod";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

export const uploadRouter = createTRPCRouter({
    // Get a presigned URL for direct upload to R2
    getUploadUrl: protectedProcedure
        .input(z.object({
            filename: z.string(),
            contentType: z.string(),
            fileSize: z.number().optional(),
            isArtwork: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;

            // Validate the file type
            if (input.isArtwork) {
                if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
                    throw new Error("Unsupported image format. Please upload JPEG, PNG or WebP files.");
                }
            } else {
                if (!ALLOWED_AUDIO_TYPES.includes(input.contentType)) {
                    throw new Error("Unsupported audio format. Please upload MP3, WAV, OGG, FLAC, or AAC files.");
                }
            }

            // Validate file size if provided
            if (input.fileSize && input.fileSize > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            }
            
            // Generate a unique key for the file, with different paths for audio vs artwork
            const filePrefix = input.isArtwork ? 'artworks' : 'uploads';
            const fileKey = `${filePrefix}/${userId}/${Date.now()}-${input.filename}`;
            
            // Only create temporary upload records for audio files, not artwork
            let tempUploadId = "";
            
            if (!input.isArtwork) {
                try {
                    // Create a new temporary upload record
                    const tempUpload = await db.tempTrackUpload.create({
                        data: {
                            id: crypto.randomUUID(),
                            userId,
                            isUploaded: false,
                        }
                    });
                    tempUploadId = tempUpload.id;
                } catch (error) {
                    console.error("Error creating temp upload record:", error);
                    throw new Error("Failed to create temporary upload record");
                }
            }

            try {
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
                    },
                });
                
                const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
                
                const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fileKey}`;
                
                return {
                    uploadUrl: presignedUrl,
                    fileKey,
                    tempUploadId,
                    fileUrl,
                };
            } catch (error) {
                console.error("Error generating presigned URL:", error);
                throw new Error("Failed to generate upload URL");
            }
        }),
        
    // Get a presigned URL for artwork upload
    getArtworkUploadUrl: protectedProcedure
        .input(z.object({
            filename: z.string(),
            contentType: z.string(),
            fileSize: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            // Validate the file type
            if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
                throw new Error("Unsupported image format. Please upload JPEG, PNG or WebP files.");
            }

            // Validate file size if provided
            if (input.fileSize && input.fileSize > MAX_FILE_SIZE) {
                throw new Error(`File size exceeds the maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            }

            try {
                // Generate a unique key for the artwork file
                const fileKey = `artworks/${userId}/${Date.now()}-${input.filename}`;
                
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
                
                const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fileKey}`;
                
                return {
                    uploadUrl: presignedUrl,
                    fileKey,
                    fileUrl,
                };
            } catch (error) {
                console.error("Error generating artwork upload URL:", error);
                throw new Error("Failed to generate artwork upload URL");
            }
        }),

    // Cancel an upload and delete the file from R2 if it was uploaded
    cancelUpload: protectedProcedure
        .input(z.object({
            tempUploadId: z.string().optional(),
            fileKey: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            try {
                // If there's a tempUploadId, delete the temporary upload record
                if (input.tempUploadId) {
                    await db.tempTrackUpload.delete({
                        where: {
                            id: input.tempUploadId,
                            userId, // Ensure the user owns this upload
                        },
                    }).catch(error => {
                        // Ignore error if record doesn't exist
                        console.warn("Could not delete temp upload record:", error);
                    });
                }
                
                // Delete the file from R2
                const deleteCommand = new DeleteObjectCommand({
                    Bucket: env.R2_BUCKET_NAME,
                    Key: input.fileKey,
                });
                
                await r2Client.send(deleteCommand);
                
                return { 
                    success: true,
                    message: "Upload canceled and file deleted",
                };
            } catch (error) {
                console.error("Error canceling upload:", error);
                throw new Error("Failed to cancel upload");
            }
        }),
        
    // Mark a temporary upload as completed
    markUploadComplete: protectedProcedure
        .input(z.object({
            tempUploadId: z.string(),
            fileKey: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            try {
                // Update the temporary upload record
                await db.tempTrackUpload.update({
                    where: {
                        id: input.tempUploadId,
                        userId, // Ensure the user owns this upload
                    },
                    data: {
                        isUploaded: true,
                    }
                });
                
                // Generate the file URL
                const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${input.fileKey}`;
                
                return { 
                    success: true,
                    fileUrl,
                };
            } catch (error) {
                console.error("Error marking upload as complete:", error);
                throw new Error("Failed to mark upload as complete");
            }
        }),
        
    // Get track waveform data
    getWaveformData: publicProcedure
        .input(z.object({
            trackId: z.string(),
        }))
        .query(async ({ input }) => {
            try {
                // First get the track to ensure it exists and get the audioUrl
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
            title: z.string(),
            fileKey: z.string(),
            tempUploadId: z.string(),
            genre: z.string(),
            description: z.string().optional(),
            privacy: z.enum(["public", "private", "schedule"]),
            tags: z.string().optional(),
            artwork: z.string().optional(), // URL of uploaded artwork
            link: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            try {
                // Verify this is a valid temporary upload
                const tempUpload = await db.tempTrackUpload.findUnique({
                    where: {
                        id: input.tempUploadId,
                        userId,
                        isUploaded: true,
                    }
                });
                
                if (!tempUpload) {
                    throw new Error("Invalid or incomplete upload");
                }
                
                // Generate the file URL
                const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${input.fileKey}`;
                
                // Extract audio metadata (like duration) - in a real implementation,
                // this might be done by a serverless function or webhook after upload
                // For now, we'll set a dummy duration
                const dummyDuration = 180; // 3 minutes in seconds
                
                // Generate dummy waveform data
                const dummyWaveformData = generateDummyWaveformData();
                
                // Create the track
                const track = await db.track.create({
                    data: {
                        title: input.title,
                        audioUrl: fileUrl,
                        genre: input.genre,
                        description: input.description,
                        isPrivate: input.privacy !== "public",
                        tags: input.tags,
                        artworkUrl: input.artwork,
                        duration: dummyDuration, // Would be extracted from the file
                        waveformData: JSON.stringify(dummyWaveformData), // Would be generated from the audio
                        userId,
                    }
                });
                
                // Delete the temporary upload record
                await db.tempTrackUpload.delete({
                    where: {
                        id: input.tempUploadId,
                    }
                });
                
                return { track };
            } catch (error) {
                console.error("Failed to create track:", error);
                throw new Error(`Failed to create track record: ${(error as Error).message}`);
            }
        }),
        
    // Create album with multiple tracks
    createAlbum: protectedProcedure
        .input(z.object({
            title: z.string(),
            tracks: z.array(z.object({
                fileKey: z.string(),
                tempUploadId: z.string(),
                title: z.string(),
            })),
            genre: z.string(),
            description: z.string().optional(),
            privacy: z.enum(["public", "private"]),
            albumType: z.enum(["ALBUM", "EP"]),
            tags: z.string().optional(),
            artwork: z.string().optional(), // URL of uploaded artwork
            link: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            try {
                // Create the album
                const album = await db.album.create({
                    data: {
                        title: input.title,
                        description: input.description,
                        type: input.albumType,
                        isPrivate: input.privacy === "private",
                        artworkUrl: input.artwork,
                        userId,
                    }
                });
                
                // Create each track
                for (const trackInput of input.tracks) {
                    // Verify this is a valid temporary upload
                    const tempUpload = await db.tempTrackUpload.findUnique({
                        where: {
                            id: trackInput.tempUploadId,
                            userId,
                            isUploaded: true,
                        }
                    });
                    
                    if (!tempUpload) {
                        console.warn(`Skipping invalid upload: ${trackInput.tempUploadId}`);
                        continue; // Skip invalid uploads
                    }
                    
                    // Generate the file URL
                    const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${trackInput.fileKey}`;
                    
                    // Generate dummy waveform data
                    const dummyWaveformData = generateDummyWaveformData();
                    
                    // Create the track - in a real implementation,
                    // you'd extract metadata like duration from the audio file
                    const dummyDuration = 180; // 3 minutes in seconds
                    
                    await db.track.create({
                        data: {
                            title: trackInput.title,
                            audioUrl: fileUrl,
                            genre: input.genre,
                            description: input.description,
                            isPrivate: input.privacy === "private",
                            tags: input.tags,
                            artworkUrl: input.artwork,
                            duration: dummyDuration, // Would be extracted from the file
                            waveformData: JSON.stringify(dummyWaveformData), // Would be generated from the audio
                            albumId: album.id,
                            userId,
                        }
                    });
                    
                    // Delete the temporary upload record
                    await db.tempTrackUpload.delete({
                        where: {
                            id: trackInput.tempUploadId,
                        }
                    });
                }
                
                return { album };
            } catch (error) {
                console.error("Failed to create album:", error);
                throw new Error(`Failed to create album record: ${(error as Error).message}`);
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
            fileKey: z.string(),
        }))
        .query(async ({ input }) => {
            try {
                const command = new GetObjectCommand({
                    Bucket: env.R2_BUCKET_NAME,
                    Key: input.fileKey,
                });
                
                const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
                
                return {
                    downloadUrl: presignedUrl,
                };
            } catch (error) {
                console.error("Error generating download URL:", error);
                throw new Error("Failed to generate download URL");
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
