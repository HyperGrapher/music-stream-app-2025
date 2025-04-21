import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types/express';
import { unauthorizedResponse } from '../helpers/responses';
import dotenv from "dotenv";

dotenv.config();

const TOKEN_SECRET = process.env.BETTER_AUTH_SECRET;

// Middleware to verify token (required)
export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return unauthorizedResponse(res, 'Token is required');
    }

    try {
        if (!TOKEN_SECRET) {
            // Log this specific error for easier debugging
            console.error('Middleware Error: TOKEN_SECRET not configured');
            throw new Error('Server configuration error'); // Generic message for client
        }

        const decoded = jwt.verify(token, TOKEN_SECRET) as AuthUser;
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return unauthorizedResponse(res, 'Invalid or expired token');
    }
};

// Middleware to optionally verify token
export const optionalVerifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (token) {
        try {
            if (!TOKEN_SECRET) {
                // Log this specific error but allow request to continue
                console.error('Middleware Warning: TOKEN_SECRET not configured for optional auth');
            } else {
                const decoded = jwt.verify(token, TOKEN_SECRET) as AuthUser;
                req.user = decoded; // Attach user if token is valid
                console.log('Optional auth: User verified', decoded.userId);
            }
        } catch (error) {
            // Log the error but don't block the request
            console.warn('Optional token verification failed:', error);
            // Do not return unauthorized response here, just proceed without user attached
        }
    }

    next(); // Always proceed, whether token was present/valid or not
}; 