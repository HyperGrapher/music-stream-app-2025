import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { applyUnsubscribe } from "@/server/modules/notifications/email";

export const runtime = "nodejs";

const page = (message: string, status = 200) =>
  new NextResponse(`<!doctype html><meta charset="utf-8"><title>Unsubscribe</title><body style="font-family:Arial,sans-serif;background:#0d0d0d;color:#e4e4e7;padding:48px"><p>${message}</p></body>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

/** NT-9: the unsubscribe link of every notification email (signed token, no login). Turns that email type off. */
export async function GET(request: NextRequest) {
  const result = await applyUnsubscribe(db, request.nextUrl.searchParams.get("t") ?? "");
  return result ? page("You are unsubscribed from these emails. You can change this any time in Settings → Notifications.") : page("This link is not valid.", 400);
}

/** RFC 8058 one-click: mail clients POST to the same URL. */
export const POST = GET;
