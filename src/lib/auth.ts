import { env } from "@/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/server/db";
import { firstFree, usernameBase } from "@/lib/names";
import { PASSWORD_PROBLEM_MESSAGES, passwordProblem } from "@/lib/passwords";
import { sendEmail } from "@/server/modules/email";
import { passwordResetEmail, verificationEmail } from "@/server/modules/email/templates";
import { consumeRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";

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

/**
 * Verification and reset mails: at most 3 per hour per address (PRD 14.3). Over the limit the mail
 * is silently dropped, so the endpoint never reveals whether an account exists.
 */
async function sendLimited(email: string, mail: Parameters<typeof sendEmail>[1]) {
    const result = await consumeRateLimit(db, `email:${mail.template}:${email.toLowerCase()}`, RATE_LIMITS.emailPerHour);
    if (result.ok) await sendEmail(db, mail);
}

const PASSWORD_PATHS = new Set(["/sign-up/email", "/reset-password", "/change-password", "/set-password"]);

export const auth = betterAuth({
    database: prismaAdapter(db, {
        provider: "postgresql",
    }),
    hooks: {
        // AU-3: common passwords are refused on every path that sets one.
        before: createAuthMiddleware(async (ctx) => {
            if (!PASSWORD_PATHS.has(ctx.path)) return;
            const body = ctx.body as { password?: string; newPassword?: string; email?: string } | undefined;
            const password = body?.newPassword ?? body?.password;
            if (!password) return;
            const problem = passwordProblem(password, { email: body?.email });
            if (problem) throw new APIError("BAD_REQUEST", { message: PASSWORD_PROBLEM_MESSAGES[problem] });
        }),
    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        // Verification links work for 24 hours.
        expiresIn: 60 * 60 * 24,
        sendVerificationEmail: async ({ user, url }) => {
            await sendLimited(user.email, verificationEmail(user.email, user.name, url));
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
        minPasswordLength: 8,
        // AU-5: one hour, single use (Better Auth deletes the token when it is used).
        resetPasswordTokenExpiresIn: 60 * 60,
        sendResetPassword: async ({ user, url }) => {
            await sendLimited(user.email, passwordResetEmail(user.email, user.name, url));
        },
        // AU-5: a reset signs every other device out.
        onPasswordReset: async ({ user }) => {
            await db.session.deleteMany({ where: { userId: user.id } });
        },
    },
    account: {
        // AU-9: users can link Google next to a password (and the last sign-in method cannot be unlinked).
        accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    user: {
        additionalFields: {
            username: { type: "string", required: false, input: false },
            role: { type: "string", required: false, input: false },
            onboardedAt: { type: "date", required: false, input: false },
        },
        // AU-7: changing the address sends a verification link to the new one.
        changeEmail: { enabled: true },
    },

})
