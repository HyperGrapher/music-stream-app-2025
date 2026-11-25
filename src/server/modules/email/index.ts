import type { PrismaClient } from "@/generated/prisma/client";

/**
 * All outgoing email goes through `sendEmail` (PRD 6.1, 13.2). Every attempt is stored in
 * `email_message`: SENT via Resend, or LOGGED when no `RESEND_API_KEY` is configured (dev, CI,
 * e2e: tests read verification and reset links from those rows). Nothing is ever dropped silently.
 */
export interface OutgoingEmail {
  to: string;
  template: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. `List-Unsubscribe`. */
  headers?: Record<string, string>;
}

const DEFAULT_FROM = "Music Stream <onboarding@resend.dev>";

type EmailDb = Pick<PrismaClient, "emailMessage">;

export async function sendEmail(db: EmailDb, email: OutgoingEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const base = { to: email.to, template: email.template, subject: email.subject, bodyHtml: email.html };

  if (!apiKey) {
    console.log(`[email:LOGGED] to=${email.to} template=${email.template} subject=${email.subject}\n${email.text}`);
    return db.emailMessage.create({ data: { ...base, status: "LOGGED" } });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      return db.emailMessage.create({
        data: { ...base, status: "FAILED", error: body.message ?? `HTTP ${response.status}` },
      });
    }
    return db.emailMessage.create({ data: { ...base, status: "SENT", providerId: body.id } });
  } catch (error) {
    return db.emailMessage.create({
      data: { ...base, status: "FAILED", error: error instanceof Error ? error.message : String(error) },
    });
  }
}

/** Drops stored HTML bodies older than 7 days (daily cron). */
export async function pruneEmailBodies(db: EmailDb, now: Date) {
  const result = await db.emailMessage.updateMany({
    where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) }, bodyHtml: { not: null } },
    data: { bodyHtml: null },
  });
  return result.count;
}
