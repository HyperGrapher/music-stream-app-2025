import express, { Router, Request, Response } from 'express';
import { successResponse } from '../helpers/responses';
import { prisma } from '../lib/prisma';

const router: Router = express.Router();

// Root route
router.get('/', (req: Request, res: Response) => {
    // Sending a simple success message or API status
    return successResponse(res, 'Express API is running');
});

// Stream errors route
router.get('/stream-error', async (req: Request, res: Response) => {

    const errors = await prisma.trackError.findMany();


    // Sending a simple success message or API status
    return successResponse(res, errors);
});

// Stream errors route
router.get('/tracks', async (req: Request, res: Response) => {

    const tracks = await prisma.track.findMany();


    // Sending a simple success message or API status
    return successResponse(res, tracks);
});

// Version route
router.get('/api/version', (req: Request, res: Response) => {
    // Using the successResponse helper for consistency
    // Note: The original response format was { message: { version: '...' }, error: false }
    // Changed to use successResponse which results in { success: true, data: { version: '...' } }
    return successResponse(res, { version: '35.2.1' });
});


export default router; 