import express, { Router, Request, Response } from 'express';
import { successResponse } from '../helpers/responses';

const router: Router = express.Router();

// Root route
router.get('/', (req: Request, res: Response) => {
    // Sending a simple success message or API status
    return successResponse(res, 'Express API is running');
});

// Version route
router.get('/api/version', (req: Request, res: Response) => {
    // Using the successResponse helper for consistency
    // Note: The original response format was { message: { version: '...' }, error: false }
    // Changed to use successResponse which results in { success: true, data: { version: '...' } }
    return successResponse(res, { version: '35.2.1' });
});


export default router; 