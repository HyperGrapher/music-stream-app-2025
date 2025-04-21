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

const router: Router = express.Router();

const JWT_PLAYBACK_SECRET = process.env.JWT_PLAYBACK_SECRET as string;
if (!JWT_PLAYBACK_SECRET) {
    throw new Error('JWT_PLAYBACK_SECRET is not defined');
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

    // Retrieve session progress - it MUST exist here as it's created/updated in the route handler
    let progress = streamProgress.get(sessionId);
    if (!progress) {
        // This case should be extremely rare now
        console.error(`CRITICAL: Session progress not found for ${sessionId} in setupStreamHandlers.`);
        // Avoid crashing, but log the error
        logStreamError(trackId, sessionId, new Error("Session progress missing in setupStreamHandlers"));
        cleanup(audioStream);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error during stream setup' });
        }
        res.end();
        return;
    }

    // Reset stream timeout
    const resetTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
            console.error(`Stream timeout for track ${trackId}, session ${sessionId}`);
            cleanup(audioStream); // Destroy the chunk stream
            logStreamError(trackId, sessionId, new Error('Stream timeout'));
            logSessionStats(sessionId, SessionStatus.Timeout);
            if (!res.headersSent) {
                res.status(408).json({ error: 'Stream timeout' });
            }
            res.end();
            // No need to delete from maps here, logSessionStats handles it
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
                logSessionStats(sessionId, SessionStatus.Error);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Maximum retry attempts exceeded' });
                }
                res.end();
                // No need to delete from maps here, logSessionStats handles it
            }
        }
    });

    audioStream.on('error', (error: Error) => {
        clearTimeout(streamTimeout);
        cleanup(audioStream);
        logStreamError(trackId, sessionId, error);
        logSessionStats(sessionId, SessionStatus.Error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming error occurred' });
        }
        res.end();
        // No need to delete from maps here, logSessionStats handles it
    });

    // Handle stream completion (for the *chunk*)
    audioStream.on('end', () => {
        try {
            clearTimeout(streamTimeout);

            // Check if the progress object still exists, might have been cleaned by timeout/error/switch
            const currentProgress = streamProgress.get(sessionId);
            if (!currentProgress) {
                // console.log(`Chunk ended for already cleaned session: ${sessionId}`);
                return;
            }

            currentProgress.lastActivityTime = Date.now(); // Update last activity time on chunk end

            // Check if the *entire file* has been streamed for this session
            const isFullFile = currentProgress.totalBytes >= currentProgress.fileSize;

            if (isFullFile) {
                logSessionStats(sessionId, SessionStatus.Completed);
            } else {
                // Optional: Log chunk completion if needed for debugging
                // console.log(`Chunk ended for session ${sessionId}. Bytes in chunk: ${bytesTransferredInChunk}. Total for session: ${formatBytesToKB(currentProgress.totalBytes)}/${formatBytesToKB(fileSize)}`);
            }

        } catch (error) {
            // Log error in the handler itself, but attempt to log session state too
            console.error('Error in stream end handler:', error);
            logStreamError(trackId, sessionId, error as Error);
            logSessionStats(sessionId, SessionStatus.Error);
        } finally {
            // No cleanup needed here, handled by logSessionStats or res.on('close') for the chunk stream
        }
    });
    // Handle client disconnect for the *chunk stream*
    res.on('close', () => {
        clearTimeout(streamTimeout);
        if (!audioStream.destroyed) {
            audioStream.destroy(); // Destroy the specific chunk stream
        }
        // We don't log session stats here automatically, as closing one chunk
        // doesn't mean the whole session is abandoned. Track switches, timeouts,
        // completion, errors, or interval cleanup handle session logging.
        // console.log(`Chunk stream closed for session: ${sessionId}`);
    });
}

// Main streaming endpoint
router.get('/stream/:trackId', async (req, res) => {
    const requestedTrackId = req.params.trackId;
    // Generate session ID based on client IP and track ID
    const clientIp = req.socket.remoteAddress || req.ip || 'unknown';
    const currentSessionId = `${clientIp}-${requestedTrackId}`;
    const filename = `${requestedTrackId}.mp3`;
    const trackPath = path.resolve(__dirname, "..", '..', "audio", filename);
    const range = req.headers.range; // Declare range header earlier

    // Cleanup function (now mainly for destroying the specific chunk stream)
    const cleanup = (audioStream?: fs.ReadStream) => {
        try {
            // Don't remove from activeSessions here, let the handlers do it based on state
            if (audioStream && !audioStream.destroyed) {
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
        // ----------------------------- 

        // Add to active sessions *set* (used for global count)
        streamStats.activeSessions.add(currentSessionId);

        // Get file size and initialize/update session progress
        let progress = streamProgress.get(currentSessionId);
        let fileSize: number;

        if (!progress) {
            // New session: get file stats asynchronously
            try {
                const stats = await fs.promises.stat(trackPath);
                if (!stats.isFile()) {
                    throw new Error('Path is not a file');
                }
                fileSize = stats.size;
            } catch (statError: any) {
                console.error(`Error getting file stats for ${trackPath}:`, statError.message);
                streamStats.activeSessions.delete(currentSessionId);
                ipToCurrentSessionId.delete(clientIp);
                // Determine appropriate status code (404 if not found, 500 otherwise)
                const statusCode = statError.code === 'ENOENT' ? 404 : 500;
                const errorMessage = statusCode === 404 ? 'Track not found' : 'Error accessing track';
                return res.status(statusCode).json({ error: errorMessage });
            }

            // Initialize progress only after successful stat
            progress = {
                totalBytes: 0,
                startTime: process.hrtime(),
                lastActivityTime: Date.now(),
                chunkCount: 1, // First chunk for this session
                fileSize: fileSize, // Store fileSize
                trackId: requestedTrackId // Store trackId
            };
            streamProgress.set(currentSessionId, progress);
            console.log(`Starting new stream session: ${currentSessionId}, File size: ${formatBytesToKB(fileSize)}`);
            streamStats.streamCount++; // Increment global counter only for new sessions
        } else {
            // Existing session: retrieve fileSize and update activity
            fileSize = progress.fileSize;
            progress.chunkCount++;
            progress.lastActivityTime = Date.now();
        }

        // Check for range header *after* confirming file exists and getting size
        if (!range) {
            cleanup();
            streamStats.activeSessions.delete(currentSessionId);
            // Don't log stats here, it's just a bad request, not a stream failure
            return res.status(400).json({ error: 'Range header is required' });
        }

        // Now safe to use range here
        const { headers, start, end, contentLength } = calculateStreamHeaders(fileSize, range);
        res.writeHead(206, headers);

        const audioStream = fs.createReadStream(trackPath, { start, end });
        const chunkStartTime = process.hrtime(); // Time for this specific chunk request

        setupStreamHandlers(audioStream, requestedTrackId, currentSessionId, chunkStartTime, { start, end, contentLength, fileSize }, res, req, cleanup);

        audioStream.pipe(res);

    } catch (error) {
        cleanup(); // Clean up potential stream
        // Attempt to log stats if session exists, otherwise just log the setup error
        if (streamProgress.has(currentSessionId)) {
            logStreamError(requestedTrackId, currentSessionId, error as Error);
            logSessionStats(currentSessionId, SessionStatus.Error);
        } else {
            console.error(`Error during initial setup for track ${requestedTrackId} (IP: ${clientIp}):`, error);
            streamStats.activeSessions.delete(currentSessionId); // Ensure cleanup if session wasn't fully created
            ipToCurrentSessionId.delete(clientIp); // Clean up ip map too
        }

        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

export default router;