import express, { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { unauthorizedResponse } from '../helpers/responses';
import { verifyToken } from '../middlewares/auth';
import { AuthUser } from '../types/express';
import dotenv from "dotenv";

dotenv.config();

const router: Router = express.Router();

// Use environment variable if available, or fallback to a development secret
// IMPORTANT: In production, always use the environment variable
const TOKEN_SECRET = process.env.BETTER_AUTH_SECRET;
const TOKEN_EXPIRY = '7d';
const CODE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

// Temporary code storage - needs to be accessible here
// Ideally, this should be managed by a shared service or database in a real app
interface AuthCode {
    code: string;
    userId: string;
    email: string;
    name: string;
    createdAt: number;
}

// Make this map exported to ensure it's shared across instances
export const authCodes = new Map<string, AuthCode>();

// Exchange auth code for token
// /api/auth/exchange-code
router.post('/exchange-code', async (req: Request, res: Response) => {
    const { code } = req.body;
    console.log('Exchange code request received with code:', code?.substring(0, 8) + '...');
    console.log('Current authCodes size:', authCodes.size);
    console.log('Code exists in map:', authCodes.has(code));

    try {
        if (!code || typeof code !== 'string') {
            return unauthorizedResponse(res, 'Valid auth code is required');
        }

        const storedCode = authCodes.get(code);

        if (!storedCode) {
            return unauthorizedResponse(res, 'Invalid or expired auth code');
        }

        const now = Date.now();
        if (now - storedCode.createdAt > CODE_EXPIRY) {
            authCodes.delete(code);
            return unauthorizedResponse(res, 'Auth code has expired');
        }

        const payload = {
            userId: storedCode.userId,
            email: storedCode.email,
            name: storedCode.name,
        };

        authCodes.delete(code);

        if (!TOKEN_SECRET) {
            console.error('Auth Route Error: TOKEN_SECRET not configured');
            throw new Error('Server configuration error');
        }

        const token = jwt.sign(payload, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRY });
        console.log({token});
        

        return res.status(200).json({
            success: true,
            token,
            user: payload
        });
    } catch (error) {
        console.error('Error exchanging auth code:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to exchange auth code'
        });
    }
});

// Generate auth code for desktop auth
router.post('/generate-code', verifyToken, async (req: Request, res: Response) => {
    try {
        const user = req.user as AuthUser; // Type assertion after verifyToken

        if (!user) { // Should not happen if verifyToken works, but good practice
            return unauthorizedResponse(res, 'User not authenticated');
        }

        const code = crypto.randomBytes(32).toString('hex');

        authCodes.set(code, {
            code,
            userId: user.userId,
            email: user.email,
            name: user.name,
            createdAt: Date.now()
        });

        console.log('Generated new auth code:', code.substring(0, 8) + '...');
        console.log('Total stored codes:', authCodes.size);

        return res.status(200).json({
            success: true,
            code
        });
    } catch (error) {
        console.error('Error generating auth code:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate auth code'
        });
    }
});

// Deep link handler for auth redirect
router.get('/desktop-callback', (req: Request, res: Response) => {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
        return res.status(400).send('Auth code is required');
    }

    return res.redirect(`phantomhud://auth/callback?code=${code}`);
});

export default router; 