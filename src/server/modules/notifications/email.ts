import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import type { NotificationType, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { sendEmail, type OutgoingEmail } from "@/server/modules/email";
import { appUrl, escapeHtml } from "@/server/modules/email/templates";

import { describeNotification } from "@/lib/notification-text";

import { groupNotifications, type NotificationItem } from "./read";

/** NT-7: which types email by default (as a daily digest). Anything else is in-app only unless turned on. */
export const EMAIL_DEFAULT_ON: ReadonlySet<NotificationType> = new Set(["FOLLOW", "COMMENT", "REPLY", "MENTION", "SYSTEM"]);
/** Types that may be emailed immediately (NT-7). */
export const IMMEDIATE_TYPES: ReadonlySet<NotificationType> = new Set(["COMMENT", "REPLY", "MENTION", "SYSTEM"]);
export const IMMEDIATE_COALESCE_MS = 5 * 60_000;

const sign = (payload: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`unsubscribe:${payload}`).digest("base64url");

/** One-click unsubscribe token (NT-9): signed, no login needed, turns one type's email off. */
export function unsubscribeToken(userId: string, type: NotificationType) {
  const payload = `${userId}.${type}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string): { userId: string; type: NotificationType } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const [userId, type] = payload.split(".");
  return userId && type ? { userId, type: type as NotificationType } : null;
}

export async function applyUnsubscribe(db: PrismaClient, token: string) {
  const parsed = readUnsubscribeToken(token);
  if (!parsed) return null;
  await db.notificationPreference.upsert({
    where: { userId_type: { userId: parsed.userId, type: parsed.type } },
    create: { userId: parsed.userId, type: parsed.type, email: false },
    update: { email: false },
  });
  return parsed;
}

function buildEmail(to: string, name: string, userId: string, items: NotificationItem[], kind: "digest" | "immediate"): OutgoingEmail {
  const base = appUrl();
  const types = [...new Set(items.map((i) => i.type))];
  const lines = items.map((item) => ({ text: describeNotification(item), href: item.target ? `${base}${item.target.href}` : `${base}/notifications` }));
  const unsubscribe = `${base}/api/unsubscribe?t=${unsubscribeToken(userId, types[0]!)}`;
  const subject = kind === "immediate" ? lines[0]!.text : `You have ${items.length} new ${items.length === 1 ? "notification" : "notifications"}`;
  const html = `<!doctype html><html><body style="margin:0;background:#0d0d0d;font-family:Arial,sans-serif;color:#e4e4e7"><div style="max-width:560px;margin:0 auto;padding:24px">
<div style="font-size:20px;font-weight:700;color:#f97316">Music Stream</div><p>Hi ${escapeHtml(name)},</p>
<ul>${lines.map((l) => `<li style="margin:8px 0"><a href="${escapeHtml(l.href)}" style="color:#fff">${escapeHtml(l.text)}</a></li>`).join("")}</ul>
<p><a href="${escapeHtml(`${base}/notifications`)}" style="color:#f97316">See all notifications</a></p>
<p style="font-size:12px;color:#71717a"><a href="${escapeHtml(unsubscribe)}" style="color:#71717a">Unsubscribe from these emails</a></p></div></body></html>`;
  const text = `${lines.map((l) => `- ${l.text} ${l.href}`).join("\n")}\n\nUnsubscribe: ${unsubscribe}`;
  return { to, template: kind === "digest" ? "notification-digest" : "notification-immediate", subject, html, text, headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
}

const rowSelect = {
  id: true, type: true, groupKey: true, message: true, readAt: true, createdAt: true,
  actor: { select: { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } } },
  track: { select: { id: true, title: true, slug: true, creator: { select: { username: true } } } },
  collection: { select: { id: true, title: true, slug: true, owner: { select: { username: true } } } },
  comment: { select: { content: true } },
} as const;

async function emailEnabled(db: PrismaClient, userId: string, types: NotificationType[]) {
  const prefs = await db.notificationPreference.findMany({ where: { userId, type: { in: types } } });
  const byType = new Map(prefs.map((p) => [p.type, p.email]));
  return new Set(types.filter((t) => byType.get(t) ?? EMAIL_DEFAULT_ON.has(t)));
}

/**
 * NT-8: one email per user with their unread, not-yet-emailed notifications of the last 24 h (only types they
 * email, grouped). Every notification is emailed at most once (`emailedAt`). Users with email off are skipped.
 */
export async function sendDailyDigests(db: PrismaClient, now = clockNow()) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const recipients = await db.notification.findMany({
    where: { readAt: null, emailedAt: null, createdAt: { gte: since }, recipient: { emailFrequency: { not: "OFF" }, status: "ACTIVE" } },
    distinct: ["recipientId"],
    select: { recipientId: true },
    take: 500,
  });
  let sent = 0;
  for (const { recipientId } of recipients) {
    const user = await db.user.findUniqueOrThrow({ where: { id: recipientId }, select: { email: true, name: true } });
    const rows = await db.notification.findMany({ where: { recipientId, readAt: null, emailedAt: null, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 200, select: rowSelect });
    const enabled = await emailEnabled(db, recipientId, [...new Set(rows.map((r) => r.type))]);
    const wanted = rows.filter((r) => enabled.has(r.type));
    if (wanted.length === 0) continue;
    await sendEmail(db, buildEmail(user.email, user.name, recipientId, groupNotifications(wanted), "digest"));
    await db.notification.updateMany({ where: { id: { in: wanted.map((r) => r.id) } }, data: { emailedAt: now } });
    sent++;
  }
  return sent;
}

/** NT-8: immediate emails for users who chose "Immediately" (comments, replies, mentions, system); coalesced per recipient per 5 minutes (the digest catches the rest). */
export async function sendImmediateEmails(db: PrismaClient, notificationIds: string[], now = clockNow()) {
  const rows = await db.notification.findMany({ where: { id: { in: notificationIds }, emailedAt: null, readAt: null }, select: { ...rowSelect, recipientId: true, recipient: { select: { email: true, name: true, emailFrequency: true } } } });
  for (const row of rows) {
    if (row.recipient.emailFrequency !== "IMMEDIATE" || !IMMEDIATE_TYPES.has(row.type)) continue;
    if (!(await emailEnabled(db, row.recipientId, [row.type])).has(row.type)) continue;
    const recent = await db.notification.findFirst({ where: { recipientId: row.recipientId, emailedAt: { gt: new Date(now.getTime() - IMMEDIATE_COALESCE_MS) } }, select: { id: true } });
    if (recent) continue;
    await sendEmail(db, buildEmail(row.recipient.email, row.recipient.name, row.recipientId, groupNotifications([row]), "immediate"));
    await db.notification.update({ where: { id: row.id }, data: { emailedAt: now } });
  }
}
