import { env } from "@/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/server/db";
import { firstFree, usernameBase } from "@/lib/names";

/** Emails listed in ADMIN_EMAILS (comma-separated, case-insensitive) get the ADMIN role at sign-in. */
const adminEmails = new Set(
  (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const isAdminEmail = (email: string) => adminEmails.has(email.toLowerCase());

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** A free permalink handle: not taken by a user, nor held by a recently renamed one (redirects live 30 days). */
async function freeUsername(seed: string) {
  return firstFree(
    usernameBase(seed),
    async (candidate) =>
      (await db.user.findUnique({ where: { username: candidate }, select: { id: true } })) !== null ||
      (await db.usernameRedirect.findFirst({
        where: { oldUsername: candidate, createdAt: { gt: new Date(Date.now() - THIRTY_DAYS_MS) } },
        select: { oldUsername: true },
      })) !== null,
    25,
    "-",
  );
}

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql",
    }),
    user: {
        // Not settable by clients (`input: false`): written by the hooks below or by server code.
        additionalFields: {
            username: { type: "string", required: false, input: false },
            role: { type: "string", required: false, input: false },
        },
    },
    databaseHooks: {
        user: {
            create: {
                // Every account gets a permalink handle immediately; the user can change it in
                // onboarding / settings (M1). Google and email sign-ups both pass through here.
                before: async (user) => {
                    const seed = user.name?.trim() || user.email.split("@")[0] || "user";
                    return {
                        data: {
                            ...user,
                            username: await freeUsername(seed),
                            role: isAdminEmail(user.email) ? "ADMIN" : "USER",
                        },
                    };
                },
            },
        },
        session: {
            create: {
                // Keeps `ADMIN_EMAILS` authoritative: edits to the variable apply at the next sign-in.
                before: async (session) => {
                    const user = await db.user.findUnique({
                        where: { id: session.userId },
                        select: { email: true, role: true },
                    });
                    if (user && isAdminEmail(user.email) && user.role !== "ADMIN") {
                        await db.user.update({ where: { id: session.userId }, data: { role: "ADMIN" } });
                    }
                    return { data: session };
                },
            },
        },
    },
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
    emailAndPassword: {
        enabled: true,
    },

})
