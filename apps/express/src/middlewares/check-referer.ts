import type { Request, Response, NextFunction } from 'express';
import dotenv from "dotenv";

dotenv.config();

const APP_DOMAIN = process.env.APP_DOMAIN; // Frontend url

export const checkReferrer = (req: Request, res: Response, next: NextFunction) => {

    if (!APP_DOMAIN) throw new Error('APP_DOMAIN is not defined in environment variables');


    const referrer = req.headers.referer || '';
    let referer_url: URL;
    // Check if the referrer is present and is a valid URL
    if (!referrer) {
        console.error('No referrer header present');
        return res.status(403).send('No referrer header present');
    }
    try {
        referer_url = new URL(referrer); // This will throw if the referrer is not a valid URL
    } catch (error) {
        console.error('Invalid URL:', referrer);
        return res.status(403).send('Invalid URL');
    }
    // Allow only requests from your app domain
    if (!referer_url.hostname.includes(APP_DOMAIN)) {
        console.error('Invalid referrer:', referrer);
        return res.status(403).send('Invalid referrer');
    }

    next();
};