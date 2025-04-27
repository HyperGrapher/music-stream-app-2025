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
    startTime: [number, number], // This startTime is for the *chunk*, not the whole session
    streamDetails: { start: number; end: number; contentLength: number; fileSize: number },
    res: Response,
    req: Request, // Added req to get session key
    cleanup: (audioStream?: Readable) => void
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
// Handle OPTIONS requests for CORS preflight
router.options('/stream/:trackId', (req, res) => {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Content-Type',
        'Access-Control-Max-Age': '86400', // 24 hours
        'Content-Length': '0',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'credentialless'
    };

    res.writeHead(204, headers);
    res.end();
});

// Main streaming endpoint
router.get('/stream/:trackId', validatePlaybackToken, async (req, res) => {
    const { trackId: jwtTrackId, userId: jwtUserId } = req.playbackData as PlaybackData;
    const requestedTrackId = req.params.trackId ?? '';
    // Generate session ID based on client IP and track ID
    const clientIp = req.socket.remoteAddress || req.ip || 'unknown';
    const currentSessionId = `${clientIp}-${requestedTrackId}`;
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
        // ----------------------------- 

        // Add to active sessions *set* (used for global count)
        streamStats.activeSessions.add(currentSessionId);

        // 1. Fetch track metadata from DB
        const track = await prisma.track.findUnique({
            where: { id: requestedTrackId },
            select: { audioUrl: true, id: true },
        });
        if (!track || !track.audioUrl) {
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
            return res.status(404).json({ error: 'Track not found' });
        }

        console.log('Track found:', { id: track.id, audioUrl: track.audioUrl });

        // 2. Extract key from audioUrl using URL parsing
        const url = new URL(track.audioUrl);
        console.log({ url });
        
        // Extract file key - simplify based on our working test approach
        // Parse the pathname to get the upload path without leading slash
        const filePath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        
        // Try to extract just the relevant path components
        const pathComponents = filePath.split('/');
        let fileKey = filePath;
        
        // If the URL contains the bucket name as a path component, remove it
        if (pathComponents[0] === process.env.R2_BUCKET_NAME) {
            fileKey = pathComponents.slice(1).join('/');
        }
        
        console.log('Resolved fileKey:', fileKey);

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
            
            console.log('Getting file info with params:', headParams);
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
            console.log('File info received:', { fileSize, contentType });
        } catch (err) {
            console.error('Error getting file info:', err);
            streamStats.activeSessions.delete(currentSessionId);
            ipToCurrentSessionId.delete(clientIp);
            return res.status(404).json({ error: 'Track file not found in storage' });
        }

        // 5. Calculate range and headers
        const { headers, start, end, contentLength } = calculateStreamHeaders(fileSize, range);
        headers['Content-Type'] = contentType;
        
        // Add CORS headers explicitly to resolve browser issues
        // Cast headers to Record<string, string> to avoid TypeScript errors
        const responseHeaders = headers as Record<string, any>;
        responseHeaders['Access-Control-Allow-Origin'] = '*'; // Simplify for testing
        responseHeaders['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        responseHeaders['Access-Control-Allow-Headers'] = 'Range, Content-Type, Authorization';
        responseHeaders['Access-Control-Expose-Headers'] = 'Content-Range, Content-Length, Content-Type';
        responseHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';
        responseHeaders['Cross-Origin-Opener-Policy'] = 'same-origin-allow-popups';
        responseHeaders['Cross-Origin-Embedder-Policy'] = 'credentialless';
        
        res.writeHead(206, responseHeaders);

        // 6. Get audio stream from R2
        let audioStream: Readable;
        try {
            console.log('Streaming from R2 with range:', `bytes=${start}-${end}`);
            
            const streamParams = {
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey,
                Range: `bytes=${start}-${end}`,
            };
            
            console.log('Final streaming parameters:', streamParams);
            const streamResp = await r2Client.send(new GetObjectCommand(streamParams));
            
            // Type guard for Readable stream
            if (!streamResp.Body || typeof (streamResp.Body as any).pipe !== 'function') {
                throw new Error('Invalid R2 stream response');
            }
            
            audioStream = streamResp.Body as unknown as Readable;
            console.log('Successfully created R2 stream');
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
    const requestedTrackId = 'voodoo'// req.params.trackId ?? '';

    const filename = `${requestedTrackId}.json`;
    const waveform = path.resolve(__dirname, "..", '..', "audio", filename);

    if (!fs.existsSync(waveform)) {
        console.error('⛔ Waveform file not found');
        return res.status(404).json({ error: 'Waveform file not found' });
    }

    const waveformData = JSON.parse(fs.readFileSync(waveform, 'utf8'));

    res.json(waveformData);



});
router.get('/:trackId', async (req, res) => {
    const requestedTrackId = req.params.trackId ?? '';

    const r2Api = 'https://ebe85640e72ffd4fbf9267fdf7c27a8b.r2.cloudflarestorage.com/music-stream-app';

    const headParams = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: 'uploads/QOkuR1qNbxDVPJhQU1Lo0V6um0Yh78Gt/1745700371982-message.mp3', // hardcoded an existing file for test
        // Range: 'bytes=0-0',
    };

    console.log('Sending GetObjectCommand with params:', headParams);

    const headResp = await r2Client.send(new GetObjectCommand(headParams));

    console.log(headResp);


    const track = await prisma.track.findFirst({
        where: { id: requestedTrackId },
        select: { audioUrl: true, id: true },
    });
    if (!track) {
        return res.status(404).json({ error: 'Track not found' });
    }

    res.json({ track, headResp: headResp.ContentType });



});
export default router;