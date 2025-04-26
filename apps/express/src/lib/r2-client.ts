import dotenv from 'dotenv';
import { S3Client } from "@aws-sdk/client-s3";
dotenv.config();


const globalForR2Client = globalThis as unknown as {
    r2Client: S3Client | undefined
}
const isDev = process.env.APP_DOMAIN?.startsWith('http://localhost');
console.log('🚨 APP_DOMAIN: ', process.env.APP_DOMAIN, { isDev });


export const r2Client = globalForR2Client.r2Client ?? new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

if (isDev) globalForR2Client.r2Client = r2Client 