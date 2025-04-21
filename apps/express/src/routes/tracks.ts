import express, { Router, Request, Response } from 'express';
import { verifyToken } from '../middlewares/auth';
import { unauthorizedResponse, successResponse } from '../helpers/responses';
import { prisma } from '../lib/prisma';
import { AuthUser } from '../types/express';
import { checkReferrer } from '../middlewares/check-referer';
import { query, validationResult, param } from 'express-validator';
import jwt from 'jsonwebtoken';
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router: Router = express.Router();

const JWT_PLAYBACK_SECRET = process.env.JWT_PLAYBACK_SECRET as string;
if (!JWT_PLAYBACK_SECRET) {
    throw new Error('JWT_PLAYBACK_SECRET is not defined');
}

router.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
    res.header("Content-Type", "audio/mp3");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin,X-Requested-With,Content-Type,Accept,content-type,audio/mp3");
    next();
});

// Streaming statistics
interface StreamStats {
    totalBytes: number;
    streamCount: number;
    startTime: [number, number];
    averageSpeed: number;
    activeSessions: Set<string>;
    errors: Map<string, number>;
}

const streamStats: StreamStats = {
    totalBytes: 0,
    streamCount: 0,
    startTime: process.hrtime(),
    averageSpeed: 0,
    activeSessions: new Set(),
    errors: new Map()
};

// Track total bytes streamed per session
const streamProgress = new Map<string, { totalBytes: number; startTime: [number, number]; lastActivityTime: number; chunkCount: number }>();

// Add timeout handling and resource limits
const STREAM_TIMEOUT = 30000; // 30 seconds
const MAX_CHUNK_RETRIES = 3;
const SESSION_CLEANUP_INTERVAL = STREAM_TIMEOUT * 2; // Check for inactive sessions every 60 seconds

// Cleanup inactive sessions
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, progress] of streamProgress.entries()) {
        if (now - progress.lastActivityTime > SESSION_CLEANUP_INTERVAL) {
            console.log(`Removing inactive session: ${sessionId}`);
            streamProgress.delete(sessionId);
            // Also remove from active sessions if it exists there (though it should be removed on close/end/error)
            streamStats.activeSessions.delete(sessionId);
        }
    }
}, SESSION_CLEANUP_INTERVAL);

function calculateStreamHeaders(filepath: string, range: string) {
    const fileSize = fs.statSync(filepath).size;
    const CHUNK_SIZE = Math.floor(10 ** 6 / 10); // 100kb chunks for optimal streaming
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0]!, 10);
    const end = Math.min(start + CHUNK_SIZE, fileSize - 1);
    const contentLength = end - start + 1;

    return {
        headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength,
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'inline',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': process.env.NEXT_URL ?? '*'
        },
        fileSize,
        start,
        end,
        contentLength
    };
}

async function logStreamError(trackId: string, sessionId: string, error: Error) {
    console.error(`Streaming error for track ${trackId}, session ${sessionId}:`, error);
    streamStats.errors.set(sessionId, (streamStats.errors.get(sessionId) ?? 0) + 1);

    try {
        await prisma.trackError.upsert({
            create: {
                track_id: trackId,
                title: trackId,
                filepath: path.resolve(__dirname, "..", '..', "audio", `${trackId}.mp3`),
                reason: error.message,
            },
            update: {
                count: { increment: 1 },
            },
            where: {
                track_id: trackId,
            },
        });
    } catch (dbError) {
        console.error('Failed to log stream error to database:', dbError);
    }
}

function setupStreamHandlers(
    audioStream: fs.ReadStream,
    trackId: string,
    sessionId: string,
    startTime: [number, number], // This startTime is for the *chunk*, not the whole session
    streamDetails: { start: number; end: number; contentLength: number; fileSize: number },
    res: Response,
    req: Request, // Added req to get session key
    cleanup: (audioStream?: fs.ReadStream) => void
) {
    const { start, end, contentLength, fileSize } = streamDetails;
    let chunkRetries = 0;
    let bytesTransferredInChunk = 0; // Renamed from bytesTransferred for clarity
    let streamTimeout: NodeJS.Timeout;

    // Initialize or retrieve session progress tracking
    let progress = streamProgress.get(sessionId);
    if (!progress) {
        console.warn(`Session progress not found for ${sessionId} in setupStreamHandlers. Initializing.`);
        progress = { totalBytes: 0, startTime: process.hrtime(), lastActivityTime: Date.now(), chunkCount: 1 };
        streamProgress.set(sessionId, progress);
        streamStats.streamCount++;
    } else {
        progress.lastActivityTime = Date.now();
    }

    // Reset stream timeout
    const resetTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
            console.error(`Stream timeout for track ${trackId}, session ${sessionId}`);
            cleanup(audioStream);
            logStreamError(trackId, sessionId, new Error('Stream timeout'));
            if (!res.headersSent) {
                res.status(408).json({ error: 'Stream timeout' });
            }
            res.end();
            streamProgress.delete(sessionId); // Clean up session on timeout
            streamStats.activeSessions.delete(sessionId);
        }, STREAM_TIMEOUT);
    };

    resetTimeout();

    // Handle data chunks
    audioStream.on('data', (chunk: string | Buffer) => {
        try {
            resetTimeout();
            progress!.lastActivityTime = Date.now(); // Update last activity time
            const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
            bytesTransferredInChunk += chunkSize;
            streamStats.totalBytes += chunkSize; // Global total bytes
            progress!.totalBytes += chunkSize; // Session total bytes

            if (bytesTransferredInChunk > contentLength) {
                throw new Error('Stream exceeded expected content length');
            }
        } catch (error) {
            console.error('Error processing chunk:', error);
            chunkRetries++;

            if (chunkRetries >= MAX_CHUNK_RETRIES) {
                cleanup(audioStream);
                logStreamError(trackId, sessionId, error as Error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Maximum retry attempts exceeded' });
                }
                res.end();
                streamProgress.delete(sessionId); // Clean up session on retry failure
                streamStats.activeSessions.delete(sessionId);
            }
        }
    });

    audioStream.on('error', (error: Error) => {
        clearTimeout(streamTimeout);
        cleanup(audioStream);
        logStreamError(trackId, sessionId, error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming error occurred' });
        }
        res.end();
        streamProgress.delete(sessionId); // Clean up session on error
        streamStats.activeSessions.delete(sessionId);
    });

    // Handle stream completion (for the *chunk*)
    audioStream.on('end', () => {
        try {
            clearTimeout(streamTimeout);
            progress!.lastActivityTime = Date.now(); // Update last activity time on chunk end

            // Check if the *entire file* has been streamed for this session
            const isFullFile = progress!.totalBytes >= fileSize;

            if (isFullFile) {
                const sessionEndTime = process.hrtime(progress!.startTime);
                const sessionDuration = (sessionEndTime[0] * 1e9 + sessionEndTime[1]) / 1e9;
                const sessionSpeed = progress!.totalBytes / sessionDuration; // Use session totals

                // Update global average speed based on completed session speed
                if (!isNaN(sessionSpeed) && isFinite(sessionSpeed)) {
                    // Simple moving average might not be best, maybe weighted? For now, simple average.
                    // Recalculate average based on *all* completed sessions. A bit complex.
                    // Let's just log the session speed for now.
                    // streamStats.averageSpeed = ((streamStats.averageSpeed * (completedSessionCount - 1)) + sessionSpeed) / completedSessionCount;
                }

                console.log('*** Full Stream Completed ***');
                console.log({
                    trackId,
                    sessionId,
                    totalFileSize: fileSize,
                    totalBytesStreamedForSession: progress!.totalBytes, // Log session total
                    sessionDuration: `${sessionDuration.toFixed(2)}s`,
                    sessionAverageSpeed: `${(sessionSpeed / 1024 / 1024).toFixed(2)} MB/s`,
                    numberOfChunks: progress!.chunkCount,
                    activeSessions: streamStats.activeSessions.size, // Current active count
                    totalSessionsStarted: streamStats.streamCount, // Total sessions ever started
                    totalBytesAllStreams: streamStats.totalBytes, // Global bytes total
                    errorsForTrack: streamStats.errors.get(trackId) ?? 0,
                });

                // Clean up the completed session
                streamProgress.delete(sessionId);
                streamStats.activeSessions.delete(sessionId); // Also remove from active sessions set

            } else {
                // Optional: Log chunk completion if needed for debugging, but not the full summary
                // console.log(`Chunk completed for session ${sessionId}, track ${trackId}. Bytes in chunk: ${bytesTransferredInChunk}. Total for session: ${progress.totalBytes}/${fileSize}`);
            }

        } catch (error) {
            console.error('Error in stream end handler:', error);
            logStreamError(trackId, sessionId, error as Error);
            streamProgress.delete(sessionId); // Clean up session on handler error
            streamStats.activeSessions.delete(sessionId);
        } finally {
            // Don't call cleanup here for the session unless it's fully complete or errored
            // Cleanup for the *chunk* stream happens implicitly or via res.on('close')
            // cleanup(audioStream); <--- Removed from here
        }
    });
    // Handle client disconnect
    res.on('close', () => {
        clearTimeout(streamTimeout);
        if (!audioStream.destroyed) {
            // cleanup(audioStream); // This destroys the chunk stream
            audioStream.destroy(); // Destroy the specific chunk stream
        }
        // If the connection closes before the full file is sent,
        // the session might still be in streamProgress.
        // The interval cleanup will handle stale sessions.
        // We *don't* delete from streamProgress here unless we know it's abandoned.
        // However, we *should* remove it from the *active* sessions count.
        streamStats.activeSessions.delete(sessionId);
        console.log(`Client connection closed for session: ${sessionId}`);

    });
}

// Main streaming endpoint
router.get('/stream/:trackId', (req, res) => {
    const trackId = req.params.trackId;
    // Generate session ID based on client IP and track ID for better session tracking
    const clientIp = req.socket.remoteAddress || req.ip || 'unknown';
    const sessionId = `${clientIp}-${trackId}`;
    const filename = `${trackId}.mp3`;
    const trackPath = path.resolve(__dirname, "..", '..', "audio", filename);

    // Cleanup function (now mainly for destroying the specific chunk stream)
    const cleanup = (audioStream?: fs.ReadStream) => {
        try {
            // Don't remove from activeSessions here, let the handlers do it based on state
            // streamStats.activeSessions.delete(sessionId);
            if (audioStream && !audioStream.destroyed) {
                audioStream.destroy();
            }
        } catch (error) {
            console.error('Error in cleanup:', error);
        }
    };

    try {
        // Add to active sessions only when starting to process the request
        streamStats.activeSessions.add(sessionId);

        // Initialize or update session progress including chunk count
        let progress = streamProgress.get(sessionId);
        if (!progress) {
            progress = { totalBytes: 0, startTime: process.hrtime(), lastActivityTime: Date.now(), chunkCount: 1 };
            streamProgress.set(sessionId, progress);
            console.log(`Starting new stream session: ${sessionId} for track ${trackId}`);
            streamStats.streamCount++;
        } else {
            progress.chunkCount++;
            progress.lastActivityTime = Date.now();
        }

        if (!fs.existsSync(trackPath)) {
            cleanup(); // Clean up potential stream
            streamStats.activeSessions.delete(sessionId); // Remove from active if file not found
            logStreamError(trackId, sessionId, new Error('Track not found'));
            return res.status(404).json({ error: 'Track not found' });
        }

        const range = req.headers.range;
        if (!range) {
            cleanup();
            streamStats.activeSessions.delete(sessionId); // Remove from active if no range header
            return res.status(400).json({ error: 'Range header is required' });
        }

        const { headers, fileSize, start, end, contentLength } = calculateStreamHeaders(trackPath, range);
        res.writeHead(206, headers);

        const audioStream = fs.createReadStream(trackPath, { start, end });
        const chunkStartTime = process.hrtime(); // Time for this specific chunk request

        setupStreamHandlers(audioStream, trackId, sessionId, chunkStartTime, { start, end, contentLength, fileSize }, res, req, cleanup);

        audioStream.pipe(res);

    } catch (error) {
        cleanup(); // Clean up potential stream
        streamStats.activeSessions.delete(sessionId); // Remove from active on error
        logStreamError(trackId, sessionId, error as Error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

export default router;