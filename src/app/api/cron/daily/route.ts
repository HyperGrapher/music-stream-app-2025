import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { r2Client } from "@/lib/r2";
import { db } from "@/server/db";
import { runDailyHousekeeping } from "@/server/modules/housekeeping";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret) return false; // never open without a configured secret
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** Vercel cron entry point (vercel.json). Sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await runDailyHousekeeping(db, r2Client);
  console.log("[cron:daily]", JSON.stringify(report));
  return NextResponse.json(report);
}
