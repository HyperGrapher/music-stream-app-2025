import { PrismaClient } from '../../prisma/generated/prisma'
import dotenv from 'dotenv';
dotenv.config();


const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}
const isDev = process.env.APP_DOMAiN?.startsWith('http://localhost');
console.log('🚨 APP_DOMAIN: ', process.env.APP_DOMAIN, { isDev });


export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log:
        isDev ? [/* "query",  */"error", "warn"] : ["error"],
});

if (isDev) globalForPrisma.prisma = prisma 