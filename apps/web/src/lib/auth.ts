import { env } from "@/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/server/db";

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql",
    }),
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // Cache duration in seconds
        },
        /**
        * The age of the session to consider it fresh.
        *
        * This is used to check if the session is fresh
        * for sensitive operations. (e.g. deleting an account)
        *
        * If the session is not fresh, the user should be prompted
        * to sign in again.
        */
        freshAge: 60 * 60 * 24 // default 24 hours
    },
    socialProviders: {
        google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
    },

})