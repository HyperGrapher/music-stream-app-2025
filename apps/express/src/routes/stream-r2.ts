import express, { Router, Request, Response } from 'express';
import { verifyToken } from '../middlewares/auth';
import { unauthorizedResponse, successResponse } from '../helpers/responses';
import { prisma } from '../lib/prisma';
import { AuthUser, PlaybackData } from '../types/express';
import { checkReferrer } from '../middlewares/check-referer';
import { query, validationResult, param } from 'express-validator';
import {
    logSessionStats,
    formatBytesToKB,
    streamProgress,
    StreamStats,
    SessionProgress,
    SessionStatus,
    calculateStreamHeaders,
    logStreamError,
    streamStats,
    ipToCurrentSessionId,
    STREAM_TIMEOUT,
    MAX_CHUNK_RETRIES,
    SESSION_CLEANUP_INTERVAL
} from '../helpers/stream-utils';
import { validatePlaybackToken } from '../middlewares/validate-playback-token';
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "../lib/r2-client";
import path from 'node:path';
import fs from "fs";


const router: Router = express.Router();

const JWT_PLAYBACK_SECRET = process.env.JWT_PLAYBACK_SECRET as string;
if (!JWT_PLAYBACK_SECRET) {
    throw new Error('JWT_PLAYBACK_SECRET is not defined');
}

function setupStreamHandlers(
    audioStream: Readable,
    trackId: string,
    sessionId: string,
    startTime: [number, number],
    streamDetails: { start: number; end: number; contentLength: number; fileSize: number },
    res: Response,
    req: Request,
    cleanup: (audioStream?: Readable) => void
) {
    const { start, end, contentLength, fileSize } = streamDetails;
    let chunkRetries = 0;
    let bytesTransferredInChunk = 0;
    let streamTimeout: NodeJS.Timeout;
    let isStreamEnded = false;
    let keepaliveInterval: NodeJS.Timeout;

    // Retrieve session progress
    let progress = streamProgress.get(sessionId);
    if (!progress) {
        console.error(`CRITICAL: Session progress not found for ${sessionId} in setupStreamHandlers.`);
        cleanup(audioStream);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error during stream setup' });
        }
        res.end();
        return;
    }

    // Setup keepalive interval to prevent timeouts
    // This works by writing an empty comment to the response periodically
    // which keeps the connection alive but doesn't affect the media playback
    keepaliveInterval = setInterval(() => {
        if (isStreamEnded) {
            clearInterval(keepaliveInterval);
            return;
        }

        try {
            // Write a zero-length chunk to keep the connection alive
            // This is invisible to the client but prevents timeouts
            if (!res.writableEnded) {
                res.write('');
            }
        } catch (error) {
            console.error('Error writing keepalive:', error);
            clearInterval(keepaliveInterval);
        }
    }, 60000); // Send a keepalive every 60 seconds

    // Reset stream timeout with backoff
    const resetTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        const timeoutDuration = Math.min(STREAM_TIMEOUT * (chunkRetries + 1), STREAM_TIMEOUT * 4);
        streamTimeout = setTimeout(() => {
            if (isStreamEnded) return;
            console.error(`Stream timeout for track ${trackId}, session ${sessionId}`);
            clearInterval(keepaliveInterval);
            cleanup(audioStream);
            logStreamError(trackId, sessionId, new Error('Stream timeout'));
            logSessionStats(sessionId, SessionStatus.Timeout);
            if (!res.headersSent) {
                res.status(408).json({ error: 'Stream timeout' });
            }
            res.end();
        }, timeoutDuration);
    };

    resetTimeout();

    // Handle data chunks
    audioStream.on('data', (chunk: string | Buffer) => {
        try {
            resetTimeout();
            progress!.lastActivityTime = Date.now();
            const chunkSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
            bytesTransferredInChunk += chunkSize;
            streamStats.totalBytes += chunkSize;
            progress!.totalBytes += chunkSize;

            if (bytesTransferredInChunk > contentLength) {
                throw new Error('Stream exceeded expected content length');
            }
        } catch (error) {
            console.error('Error processing chunk:', error);
            chunkRetries++;

            if (chunkRetries >= MAX_CHUNK_RETRIES) {
                clearInterval(keepaliveInterval);
                cleanup(audioStream);
                logStreamError(trackId, sessionId, error as Error);
                logSessionStats(sessionId, SessionStatus.Error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Maximum retry attempts exceeded' });
                }
                res.end();
            } else {
                // Attempt recovery by requesting a new chunk
                resetTimeout();
            }
        }
    });

    audioStream.on('error', (error: Error) => {
        if (isStreamEnded) return;
        clearTimeout(streamTimeout);
        clearInterval(keepaliveInterval);
        cleanup(audioStream);
        logStreamError(trackId, sessionId, error);
        logSessionStats(sessionId, SessionStatus.Error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming error occurred' });
        }
        res.end();
    });

    audioStream.on('end', () => {
        try {
            isStreamEnded = true;
            clearTimeout(streamTimeout);
            clearInterval(keepaliveInterval);

            const currentProgress = streamProgress.get(sessionId);
            if (!currentProgress) return;

            currentProgress.lastActivityTime = Date.now();
            const isFullFile = currentProgress.totalBytes >= currentProgress.fileSize;

            if (isFullFile) {
                logSessionStats(sessionId, SessionStatus.Completed);
            }
        } catch (error) {
            console.error('Error in stream end handler:', error);
            logStreamError(trackId, sessionId, error as Error);
            logSessionStats(sessionId, SessionStatus.Error);
        }
    });

    res.on('close', () => {
        isStreamEnded = true;
        clearTimeout(streamTimeout);
        clearInterval(keepaliveInterval);
        if (!audioStream.destroyed) {
            audioStream.destroy();
        }
    });
}
// Handle OPTIONS requests for CORS preflight
router.options('/stream/:trackId', (req, res) => {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': process.env.NEXT_URL ?? (process.env.APP_DOMAIN ?? '*'),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type',
        'Content-Length': '0',
    };
    res.writeHead(204, headers);
    res.end();
});

// Main streaming endpoint
// for more on stream security: https://grok.com/chat/9f5b7841-3e7f-4ba3-9156-3cb171ba1e84
router.get('/stream/:trackId', validatePlaybackToken, async (req, res) => {
    const { trackId: jwtTrackId, userId: jwtUserId, key: fileKey } = req.playbackData as PlaybackData;
    const requestedTrackId = req.params.trackId ?? '';

    try {
        // const sessionData = req.cookies['better-auth.session_data'];
        // console.log({ sessionData });

    } catch (error) {
        console.error("Cannot read session data");

    }

    if (jwtTrackId !== requestedTrackId) return res.status(404).json({ error: 'Forbidden key' });

    // Generate session ID based on client IP and track ID
    const clientIp = req.socket.remoteAddress || req.ip || 'unknown';
    const currentSessionId = `${jwtUserId}-${fileKey}`;
    const range = req.headers.range; // Declare range header earlier

    // Cleanup function (for destroying the specific chunk stream)
    const cleanup = (audioStream?: Readable) => {
        try {
            if (audioStream && typeof audioStream.destroy === 'function' && !audioStream.destroyed) {
                audioStream.destroy();
            }
        } catch (error) {
            console.error('Error in cleanup:', error);
        }
    };

    try {
        // --- Track Switch Detection ---
        const previousSessionId = ipToCurrentSessionId.get(clientIp);
        if (previousSessionId && previousSessionId !== currentSessionId) {
            // User likely switched tracks
            console.log(`Track switch detected for IP ${clientIp}: ${previousSessionId} -> ${currentSessionId}`);
            logSessionStats(previousSessionId, SessionStatus.Switched);
            // Note: logSessionStats handles cleanup of previousSessionId
        }
        // Update the current session for this IP
        ipToCurrentSessionId.set(clientIp, currentSessionId);

        // Add to active sessions *set* (used for global count)
        streamStats.activeSessions.add(currentSessionId);


        if (!fileKey) {
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
            return res.status(404).json({ error: 'Track not found' });
        }

        // 4. Check for range header
        if (!range) {
            streamStats.activeSessions.delete(currentSessionId);
            return res.status(400).json({ error: 'Range header is required' });
        }

        // 3. Get file size and content type directly from R2 - similar to your test code
        let fileSize = 0;
        let contentType = 'audio/mpeg';

        try {
            // Get just the headers first to determine file size
            const headParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey,
                Range: 'bytes=0-0'
            };

            const headResp = await r2Client.send(new GetObjectCommand(headParams));

            // Extract file size from Content-Range header (format: "bytes 0-0/TOTAL_SIZE")
            if (headResp.ContentRange) {
                const totalSizeStr = headResp.ContentRange.split('/')[1];
                fileSize = parseInt((totalSizeStr ?? "0"), 10);
            } else if (headResp.ContentLength) {
                // Fallback if ContentRange isn't available
                fileSize = headResp.ContentLength;
            }

            contentType = headResp.ContentType || 'audio/mpeg';
        } catch (err) {
            console.error('Error getting file info:', err);
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
            return res.status(404).json({ error: 'Track file not found in storage' });
        }

        // 5. Calculate range and headers
        const { headers, start, end, contentLength } = calculateStreamHeaders(fileSize, range);
        headers['Content-Type'] = contentType;

        res.writeHead(206, headers);

        // 6. Get audio stream from R2
        let audioStream: Readable;
        try {
            const streamParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey,
                Range: `bytes=${start}-${end}`,
            };

            const streamResp = await r2Client.send(new GetObjectCommand(streamParams));

            // Type guard for Readable stream
            if (!streamResp.Body || typeof (streamResp.Body as any).pipe !== 'function') {
                throw new Error('Invalid R2 stream response');
            }

            audioStream = streamResp.Body as unknown as Readable;

        } catch (err) {
            console.error('Error creating R2 stream:', err);
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
            return res.status(500).json({ error: 'Error streaming from storage' });
        }

        // 7. Session progress management
        let progress = streamProgress.get(currentSessionId);
        if (!progress) {
            // Ensure fileSize is valid
            const validFileSize = fileSize > 0 ? fileSize : 1; // Use 1 as a minimum valid size

            progress = {
                totalBytes: 0,
                startTime: process.hrtime(),
                lastActivityTime: Date.now(),
                chunkCount: 1,
                fileSize: validFileSize, // Use the validated file size
                trackId: requestedTrackId,
            };
            streamProgress.set(currentSessionId, progress);
            streamStats.streamCount++;
        } else {
            progress.chunkCount++;
            progress.lastActivityTime = Date.now();
        }

        // 8. Setup stream handlers and pipe
        setupStreamHandlers(
            audioStream,
            requestedTrackId,
            currentSessionId,
            process.hrtime(),
            {
                start: start,
                end: end,
                contentLength: contentLength,
                fileSize: fileSize
            },
            res,
            req,
            cleanup
        );

        audioStream.pipe(res);
    } catch (error) {
        cleanup();
        if (streamProgress.has(currentSessionId)) {
            logStreamError(requestedTrackId, currentSessionId, error as Error);
            logSessionStats(currentSessionId, SessionStatus.Error);
        } else {
            console.error(`Error during initial setup for track ${requestedTrackId} (IP: ${clientIp}):`, error);
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.get('/stream/:trackId/waveform', validatePlaybackToken, async (req, res) => {
    const { trackId: jwtTrackId, userId: jwtUserId } = req.playbackData as PlaybackData;
    const requestedTrackId = req.params.trackId ?? '';
    const filename = `${requestedTrackId}.json`;
    const waveform = path.resolve(__dirname, "..", '..', "audio", filename);
    if (!fs.existsSync(waveform)) {
        return res.status(404).json({ error: 'Waveform file not found' });
    }
    const waveformData = JSON.parse(fs.readFileSync(waveform, 'utf8'));
    res.json(waveformData);
});

router.get('/:trackId', async (req, res) => {
    const requestedTrackId = req.params.trackId ?? '';
    const track = await prisma.track.findFirst({
        where: { id: requestedTrackId },
        select: { storageKey: true, id: true },
    });
    if (!track) {
        return res.status(404).json({ error: 'Track not found' });
    }
    res.json({ track });
});

export default router;