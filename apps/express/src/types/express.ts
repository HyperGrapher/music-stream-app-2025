
export interface AuthUser {
    userId: string;
    email: string;
    name: string;
}

export interface PlaybackData {
    trackId: string;
    userId: string;
    timestamp: number;
}

// Extend Express's Request type definition
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            playbackData?: PlaybackData;
        }
    }
} 