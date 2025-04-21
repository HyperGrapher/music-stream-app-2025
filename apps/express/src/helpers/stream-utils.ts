import { prisma } from "../lib/prisma";
import fs from "fs"; // Need fs for ReadStream type in setupStreamHandlers if moved later
import path from "path"; // Keep path if needed, e.g., for logStreamError filepath
import crypto from "crypto"; // Keep crypto if needed

// --- Constants ---
export const STREAM_TIMEOUT = 30000; // 30 seconds
export const MAX_CHUNK_RETRIES = 3;
export const SESSION_CLEANUP_INTERVAL = STREAM_TIMEOUT * 2; // Check for inactive sessions every 60 seconds

// --- State Variables ---

// Streaming statistics (Global)
export const streamStats: StreamStats = {
    totalBytes: 0,
    streamCount: 0, // Represents total *sessions* initiated
    startTime: process.hrtime(),
    averageSpeed: 0, // Note: Global average speed calculation removed for simplicity
    activeSessions: new Set(),
    errors: new Map() // Tracks errors per session ID
};

// Track total bytes streamed per session (Session specific)
export const streamProgress = new Map<string, SessionProgress>();

// Map client IP to their latest session ID to detect track changes (Global)
export const ipToCurrentSessionId = new Map<string, string>();


// --- Interfaces and Enums ---

// Streaming statistics
export interface StreamStats {
    totalBytes: number;
    streamCount: number;
    startTime: [number, number];
    averageSpeed: number;
    activeSessions: Set<string>;
    errors: Map<string, number>;
}

// Enum for session statuses
export enum SessionStatus {
    Completed = 'completed',
    Switched = 'switched',
    Timeout = 'timeout',
    Error = 'error',
    InactiveCleanup = 'inactive_cleanup',
}

// Session progress structure
export interface SessionProgress {
    totalBytes: number;
    startTime: [number, number];
    lastActivityTime: number;
    chunkCount: number;
    fileSize: number;
    trackId: string;
}

// --- Utility Functions ---

export async function logStreamError(trackId: string, sessionId: string, error: Error) { // Removed streamStats param, use exported const
    console.error(`Streaming error occurred for track ${trackId}, session ${sessionId}:`, error.message);
    // Increment error count for this specific session
    streamStats.errors.set(sessionId, (streamStats.errors.get(sessionId) ?? 0) + 1);

    // Attempt to log to DB, but don't let it block console logging
    try {
        await prisma.trackError.upsert({
            create: {
                track_id: trackId,
                title: trackId,
                filepath: `audio/${trackId}.mp3`,
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
        console.error(`Failed to log stream error to database for session ${sessionId}:`, dbError);
    }
}

export function calculateStreamHeaders(fileSize: number, range: string) {
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
            'Access-Control-Allow-Origin': process.env.NEXT_URL ?? (process.env.APP_DOMAIN ?? '*')
        },
        fileSize,
        start,
        end,
        contentLength
    };
}

// Helper function to format bytes to KB
export function formatBytesToKB(bytes: number): string {
    if (bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    return `${kb.toFixed(2)} KB`;
}

// Centralized function for logging session stats and cleaning up
export function logSessionStats(sessionId: string, status: SessionStatus) { // Removed streamStats param, use exported const
    const progress = streamProgress.get(sessionId);
    if (!progress) {
        console.log(`Attempted to log stats for already cleaned session: ${sessionId} (${status})`);
        return;
    }

    const { totalBytes, startTime, chunkCount, fileSize, trackId, lastActivityTime } = progress;
    const sessionEndTime = process.hrtime(startTime);
    const sessionDuration = (sessionEndTime[0] * 1e9 + sessionEndTime[1]) / 1e9;
    const sessionSpeed = sessionDuration > 0 ? totalBytes / sessionDuration : 0;

    console.log(`🚩 *** Stream Session ${status.toUpperCase()} ***`);
    console.log({
        status,
        trackId,
        sessionId,
        totalFileSize: formatBytesToKB(fileSize),
        totalBytesStreamed: formatBytesToKB(totalBytes),
        sessionDuration: `${sessionDuration.toFixed(2)}s`,
        sessionAverageSpeed: `${formatBytesToKB(sessionSpeed)}/s`,
        numberOfChunks: chunkCount,
        activeSessions: streamStats.activeSessions.size,
        totalSessionsStarted: streamStats.streamCount,
        totalBytesAllStreams: formatBytesToKB(streamStats.totalBytes),
        errorsForSession: streamStats.errors.get(sessionId) ?? 0,
        isComplete: status === SessionStatus.Completed || totalBytes >= fileSize
    });

    // Clean up session data
    streamProgress.delete(sessionId);
    streamStats.activeSessions.delete(sessionId);
    streamStats.errors.delete(sessionId); // Clean up errors for this session

    // If the session being cleaned is the *current* one for its IP, clear the IP mapping
    // This prevents immediately logging a 'switched' status if the same user reconnects quickly
    // Find the IP associated with this sessionId (less efficient, might need reverse map if performance critical)
    let ipForSession: string | null = null;
    for (const [ip, sId] of ipToCurrentSessionId.entries()) {
        if (sId === sessionId) {
            ipForSession = ip;
            break;
        }
    }
    if (ipForSession && ipToCurrentSessionId.get(ipForSession) === sessionId) {
        console.log(`Clearing IP mapping for ${ipForSession} due to session cleanup (${status}).`);
        ipToCurrentSessionId.delete(ipForSession);
    }
}

// --- Background Tasks ---

// Cleanup inactive sessions
setInterval(() => {
    const now = Date.now();
    // Iterate over a copy of keys to avoid issues if map is modified during iteration by logSessionStats
    const sessionIdsToCheck = Array.from(streamProgress.keys());

    for (const sessionId of sessionIdsToCheck) {
        const progress = streamProgress.get(sessionId); // Re-fetch progress in case it was deleted
        if (progress && now - progress.lastActivityTime > SESSION_CLEANUP_INTERVAL) {
            console.log(`Cleaning up inactive session via interval: ${sessionId}`);
            logSessionStats(sessionId, SessionStatus.InactiveCleanup);
            // No need to delete here, logSessionStats does it
        }
    }
}, SESSION_CLEANUP_INTERVAL);