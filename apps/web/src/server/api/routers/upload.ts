import { z } from "zod";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { env } from "@/env";
import {
    createTRPCRouter,
    protectedProcedure,
} from "@/server/api/trpc";

export const uploadRouter = createTRPCRouter({
    // Get a presigned URL for direct upload to R2
    getUploadUrl: protectedProcedure
        .input(z.object({
            filename: z.string(),
            contentType: z.string(),
            isArtwork: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            // Generate a unique key for the file, with different paths for audio vs artwork
            const filePrefix = input.isArtwork ? 'artworks' : 'uploads';
            const fileKey = `${filePrefix}/${userId}/${Date.now()}-${input.filename}`;
            
            // Only create temporary upload records for audio files, not artwork
            let tempUploadId = undefined;
            
            if (!input.isArtwork) {
                // Create a new temporary upload record
                const tempUpload = await db.tempTrackUpload.create({
                    data: {
                        id: crypto.randomUUID(),
                        userId,
                        isUploaded: false,
                    }
                });
                tempUploadId = tempUpload.id;
            }

            if(tempUploadId === undefined) tempUploadId=''

            // Create the presigned URL for upload
            const command = new PutObjectCommand({
                Bucket: env.R2_BUCKET_NAME,
                Key: fileKey,
                ContentType: input.contentType,
            });
            
            const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
            
            return {
                uploadUrl: presignedUrl,
                fileKey,
                tempUploadId,
                fileUrl: `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fileKey}`,
            };
        }),
        
    // Get a presigned URL for artwork upload
    getArtworkUploadUrl: protectedProcedure
        .input(z.object({
            filename: z.string(),
            contentType: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
            // Generate a unique key for the artwork file
            const fileKey = `artworks/${userId}/${Date.now()}-${input.filename}`;
            
            // Create the presigned URL for upload
            const command = new PutObjectCommand({
                Bucket: env.R2_BUCKET_NAME,
                Key: fileKey,
                ContentType: input.contentType,
            });
            
            const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
            
            return {
                uploadUrl: presignedUrl,
                fileKey,
                fileUrl: `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${fileKey}`,
            };
        }),
        
    // Mark a temporary upload as completed
    markUploadComplete: protectedProcedure
        .input(z.object({
            tempUploadId: z.string(),
            fileKey: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            
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
            
            try {
                // Extract audio metadata (like duration) - in a real implementation,
                // this might be done by a serverless function or webhook after upload
                // For now, we'll set a dummy duration
                const dummyDuration = 180; // 3 minutes in seconds
                
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
                throw new Error("Failed to create track record");
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
                        continue; // Skip invalid uploads
                    }
                    
                    // Generate the file URL
                    const fileUrl = `https://${env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${trackInput.fileKey}`;
                    
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
                throw new Error("Failed to create album record");
            }
        }),
        
    // Get a download URL for an existing file
    getDownloadUrl: protectedProcedure
        .input(z.object({
            fileKey: z.string(),
        }))
        .query(async ({ input }) => {
            const command = new GetObjectCommand({
                Bucket: env.R2_BUCKET_NAME,
                Key: input.fileKey,
            });
            
            const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
            
            return {
                downloadUrl: presignedUrl,
            };
        }),
});
