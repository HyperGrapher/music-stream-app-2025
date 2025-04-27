import dotenv from 'dotenv';
import { S3Client } from "@aws-sdk/client-s3";
dotenv.config();

// Log important environment variables to debug R2 connection
console.log('R2 Configuration:');
console.log('- R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME);
console.log('- R2_ACCOUNT_ID:', process.env.R2_ACCOUNT_ID?.substring(0, 5) + '...');
console.log('- R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID ? '✓ Set' : '❌ Missing');
console.log('- R2_SECRET_ACCESS_KEY:', process.env.R2_SECRET_ACCESS_KEY ? '✓ Set' : '❌ Missing');

const globalForR2Client = globalThis as unknown as {
    r2Client: S3Client | undefined
}
const isDev = process.env.APP_DOMAIN?.startsWith('http://localhost');

// Initialize the R2 client with proper configuration
export const r2Client = globalForR2Client.r2Client ?? new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true // Use path-style URLs for S3 compatibility
});

// Create a function to validate the R2 connection
export async function validateR2Connection() {
    try {
        // Import GetObjectCommand here to avoid circular dependencies
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        
        // Use a test file path that we know exists based on earlier testing
        const testParams = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: 'uploads/QOkuR1qNbxDVPJhQU1Lo0V6um0Yh78Gt/1745700371982-message.mp3', 
            Range: 'bytes=0-0' // Just get the first byte to verify access
        };
        
        console.log('Testing R2 connection with object request...');
        const response = await r2Client.send(new GetObjectCommand(testParams));
        
        console.log('✅ R2 connection successful! Content type:', response.ContentType);
        return true;
    } catch (error) {
        console.error('❌ R2 connection validation failed:', error);
        return false;
    }
}

// Validate connection in development mode
if (isDev && false) {
    globalForR2Client.r2Client = r2Client;
    validateR2Connection().catch(console.error);
} 