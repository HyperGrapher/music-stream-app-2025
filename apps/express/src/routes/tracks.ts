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


const router: Router = express.Router();


const JWT_PLAYBACK_SECRET = process.env.JWT_PLAYBACK_SECRET as string;
if (!JWT_PLAYBACK_SECRET) {
    throw new Error('JWT_PLAYBACK_SECRET is not defined');
}






// Protected streaming endpoint
router.get('/stream/:trackId', (req, res) => {
    const trackId = req.params.trackId;
    const filename = `${trackId}.mp3`;
    const trackPath = path.resolve(__dirname, "..", "audio", filename);
    // const trackPath = path.resolve(__dirname, `./tracks/${trackId}.mp3`);

    // Verify the file exists
    if (!fs.existsSync(trackPath)) {
        return res.status(404).send('Track not found');
    }

    const stat = fs.statSync(trackPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Handle range requests (important for seeking in audio)
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = (end - start) + 1;
        const file = fs.createReadStream(trackPath, { start, end });

        // Set proper headers for streaming
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'inline', // Important to prevent downloads
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        });

        file.pipe(res);
    } else {
        // Stream the whole file if no range is specified
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'inline',
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        });

        fs.createReadStream(trackPath).pipe(res);
    }
});


let counter = 1;
let totalBytes = 0;
let begin: [number, number];

router.get("/stream-api/stream/:target", (req: Request<{ target: string }>, res: Response) => {
    if (begin === null) begin = process.hrtime();

    const { target } = req.params;
    const jwtTarget = 'asa'// req.user?.target;
    const user = req.user ?? null;

    if (jwtTarget) {
        // jwtTarget is rate limited, so only check if it exists
        if (target !== jwtTarget) return res.status(403).json({ error: true, message: "Invalid request" });
    }

    const filename = `${target}.mp3`;
    const filepath = path.resolve(__dirname, "..", "music", filename);

    if (!fs.existsSync(filepath)) {
        console.error("NO FILE", __filename, __dirname);
        return res.status(404).json({
            error: true,
            message: "Source not found E:117",
        });
    }

    const range = req.headers.range;

    if (!range) {
        return res.status(400).json({
            error: true,
            message: "Stream not allowed: E:126",
        });
    }

    const { headers, fileSize, start, end } = calculateHeaders(filepath, range);
    if (start < 10) totalBytes = 0; // reset totalBytes on re-runs
    res.writeHead(206, headers); // 206 -> Partial content

    const audioStream = fs.createReadStream(filepath, { start, end });

    audioStream.on("error", async (err) => {
        console.error("Streaming error: E:152", err);
        try {
            await prisma.trackError.upsert({
                create: {
                    track_id: jwtTarget,
                    title: jwtTarget,
                    filepath: filepath,
                    reason: 'streaming error',
                },
                update: {
                    count: {
                        increment: 1,
                    },
                },
                where: {
                    track_id: jwtTarget,
                },
            });
        } catch (error) {
            console.error(error);
        }
    });

    audioStream.on("close", async () => {
        const streamDiff = fileSize - end;

        if (streamDiff < 100) {
            const diff = process.hrtime(begin);
            const res = diff[0] * 1e9 + diff[1];

            console.log("%d times streamed, %d bytes processed, %d bytes per sec", counter, totalBytes, (totalBytes / res) * 1e9);
            console.log("Stream time: %d seconds", res / 1e9);
            console.log("<<<<< Stream reached its end >>>>>");
        }
    });

    audioStream.pipe(res);
});






// Add short-lived playback tokens
// https://claude.ai/chat/3506c123-0cf9-4be6-897b-8d36f39c8fda
// /http://localhost:4000/tracks/v1/:trackId/playback-token
router.post('/v1/:trackId/playback-token', (req: Request, res: Response) => {
    const trackId = req.params.trackId ?? '';
    const userId = req.user!.userId;

    // Generate a token that expires in 5 minutes
    const playbackToken = jwt.sign(
        { trackId, userId, timestamp: Date.now() },
        JWT_PLAYBACK_SECRET,
        { expiresIn: '5m' }
    );

    res.json({ playbackToken });
});

function calculateHeaders(filepath: string, range: string) {
    const fileSize = fs.statSync(filepath).size;
    const CHUNK_SIZE = Math.floor(10 ** 6 / 10); // 10**6=100kb
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE, fileSize - 1);
    const contentLength = end - start + 1;
    const NEXT_URL = process.env.NEXT_URL ?? "http://localhost:3001";

    totalBytes += contentLength;
    counter += 1;

    const headers = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": contentLength,
        "Content-Type": "audio/mp3",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Access-Control-Allow-Origin": NEXT_URL, // TODO: full SSL address - get from environment var
    };

    return { headers, fileSize, start, end };
}



export default router;