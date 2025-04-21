import express, { Router, Request, Response } from 'express';
import { verifyToken } from '../middlewares/auth';
import { unauthorizedResponse, successResponse } from '../helpers/responses';
import { prisma } from '../lib/prisma';
import { AuthUser } from '../types/express';
import { checkReferrer } from '../middlewares/check-referer';

const router: Router = express.Router();



// Test route to get all users (consider adding authentication/authorization)
router.get('/all', async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                emailVerified: true,
                image: true,
                createdAt: true,
            }
        });

        return successResponse(res, users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

// only applies to the routes below this line
router.use(checkReferrer);

// Protected route example: Get user profile
router.get('/profile', verifyToken, (req: Request, res: Response) => {
    const user = req.user as AuthUser; // Type assertion after verifyToken

    if (!user) {
        // This check is technically redundant due to verifyToken, but good practice
        return unauthorizedResponse(res, 'User not found after token verification');
    }

    console.log('✅ API: /api/user/profile', user);

    // Return user profile from the decoded JWT
    return res.status(200).json({
        success: true,
        user: {
            userId: user.userId,
            email: user.email,
            name: user.name,
        }
    });
});

export default router; 