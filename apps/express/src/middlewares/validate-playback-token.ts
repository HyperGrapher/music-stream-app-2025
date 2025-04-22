import type { Request, Response, NextFunction } from 'express';
import dotenv from "dotenv";
import jwt from 'jsonwebtoken';
import { PlaybackData } from '../types/express';
dotenv.config();

const MINUTES_TO_EXPIRE = 1;
// Playback token validation middleware
export const validatePlaybackToken = (req: Request, res: Response, next: NextFunction) => {
    const playbackToken = req.query.token as string;

    if (!playbackToken) {
        return res.status(401).send('Playback token is required');
    }

    try {
        // Verify the playback token
        const decoded = jwt.verify(playbackToken, process.env.JWT_PLAYBACK_SECRET as string) as PlaybackData;

        // Check if the token matches the requested track
        if (decoded.trackId !== req.params.trackId) {
            console.error('Invalid playback token for this track');
            return res.status(403).send('Invalid playback token for this track');
        }

        // Check if token is too old (optional additional security)
        const tokenAge = Date.now() - decoded.timestamp;
        const maxAge = MINUTES_TO_EXPIRE * 60 * 1000; //  minutes in milliseconds

        if (tokenAge > maxAge) {
            console.error('Playback token has expired ⛔');
            // TODO: refresh token on the client
            return res.status(401).send('Playback token has expired');
        }

        // Add decoded data to the request for potential logging or analytics
        req.playbackData = decoded;
        next();
    } catch (err) {
        return res.status(403).send('Invalid or expired playback token');
    }
};
