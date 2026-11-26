import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { recordHit, touchView } from "@/server/modules/analytics";
import { cleanPath, cleanReferrer, parseUserAgent } from "@/server/modules/analytics/ua";
import { enforceRateLimit } from "@/server/modules/rate-limit";
import { clientIpFromHeaders, countryFromHeaders } from "@/server/modules/tracks/plays";

export const dynamic = "force-dynamic";

const id = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
const body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hit"), visitorId: id, sessionId: id, path: z.string().max(400), referrer: z.string().max(400).optional() }),
  z.object({ type: z.literal("ping"), visitorId: id, viewId: z.string().uuid() }),
]);

const quiet = () => new NextResponse(null, { status: 204 });

/** Page-view beacon for the admin analytics: `hit` when a page opens, `ping` while it stays open. Never errors loudly: tracking must not hurt the page. */
export async function POST(request: Request) {
  try {
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return quiet();
    const requestHeaders = await headers();
    const agent = parseUserAgent(requestHeaders.get("user-agent"));
    if (agent.bot) return quiet();
    const ip = clientIpFromHeaders(requestHeaders);
    await enforceRateLimit(db, "analytics", ip, { max: 240, windowSeconds: 60 });

    if (parsed.data.type === "ping") {
      await touchView(db, parsed.data.viewId, parsed.data.visitorId);
      return quiet();
    }
    const path = cleanPath(parsed.data.path);
    if (!path) return quiet();
    const session = await auth.api.getSession({ headers: requestHeaders }).catch(() => null);
    const ownHost = new URL(env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL).host;
    const city = requestHeaders.get("x-vercel-ip-city");
    const viewId = await recordHit(db, {
      visitorId: parsed.data.visitorId,
      sessionId: parsed.data.sessionId,
      userId: session?.user.id ?? null,
      ip: ip === "unknown" ? null : ip,
      countryCode: countryFromHeaders(requestHeaders),
      city: city ? decodeURIComponent(city).slice(0, 80) : null,
      path,
      referrer: cleanReferrer(parsed.data.referrer, ownHost),
      userAgent: requestHeaders.get("user-agent"),
      device: agent.device,
      browser: agent.browser,
    });
    return NextResponse.json({ viewId });
  } catch {
    return quiet();
  }
}
