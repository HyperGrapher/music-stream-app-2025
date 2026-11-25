import { env } from "@/env";

import type { OutgoingEmail } from "./index";

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!
  ));

export const appUrl = () => env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;

/** Shell shared by every email. All dynamic values must go through `escapeHtml` before reaching it. */
function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#0d0d0d;font-family:Arial,sans-serif;color:#e4e4e7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#18181b;border-radius:12px;padding:32px">
<tr><td><div style="font-size:20px;font-weight:700;color:#f97316;margin-bottom:16px">Music Stream</div>
<h1 style="font-size:20px;margin:0 0 16px;color:#fff">${escapeHtml(title)}</h1>${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#71717a">You received this because of activity on your Music Stream account.</p>
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700">${escapeHtml(label)}</a></p>`;

export function verificationEmail(to: string, name: string, url: string): OutgoingEmail {
  return {
    to,
    template: "verify-email",
    subject: "Verify your email for Music Stream",
    html: layout(
      "Verify your email",
      `<p>Hi ${escapeHtml(name)}, confirm your address to upload, comment and repost.</p>${button(url, "Verify email")}`,
    ),
    text: `Hi ${name}, verify your email: ${url}`,
  };
}

export function passwordResetEmail(to: string, name: string, url: string): OutgoingEmail {
  return {
    to,
    template: "reset-password",
    subject: "Reset your Music Stream password",
    html: layout(
      "Reset your password",
      `<p>Hi ${escapeHtml(name)}, this link works for one hour and only once.</p>${button(url, "Choose a new password")}<p style="color:#a1a1aa;font-size:13px">If you did not ask for this, ignore this email.</p>`,
    ),
    text: `Hi ${name}, reset your password (valid for one hour): ${url}`,
  };
}
