import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { db } from "@/server/db";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import { getViewerId } from "@/server/modules/tracks/delivery";
import {
  clientIpFromHeaders,
  computeClientHash,
  countryFromHeaders,
  recordPlayEvent,
} from "@/server/modules/tracks/plays";
import { trackAccessSelect } from "@/server/modules/visibility";

export const runtime = "nodejs";

const PLAY_SOURCES = [
  "PROFILE", "TRACK_PAGE", "COLLECTION", "FEED", "HOME", "DISCOVER", "SEARCH", "CHARTS",
  "LIBRARY", "HISTORY", "STATION", "EMBED", "OTHER",
] as const;

const bodySchema = z
  .object({
    source: z.enum(PLAY_SOURCES).optional(),
    collectionId: z.string().uuid().optional(),
  })
  .partial();

/**
 * Called by the player after a few seconds of actual listening. Always answers
 * the same shape for a viewable track whether or not the play was counted (deduped plays
 * are indistinguishable to the caller), so the counter gives no oracle for abuse.
 * `eventId` is what the progress beacon reports against.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await params;
  if (!isTrackId(trackId)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const listenerId = await getViewerId(request.headers);
  const track = await db.track.findUnique({ where: { id: trackId }, select: trackAccessSelect });
  if (
    !track ||
    !(await authorizeTrack(db, track, { ...accessParamsFromUrl(request.url), viewerId: listenerId }))
  ) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // The body is optional context from the player; a missing or malformed one never blocks a play.
  const raw: unknown = await request.json().catch(() => ({}));
  const body = bodySchema.safeParse(raw);
  const clientHash = computeClientHash(
    clientIpFromHeaders(request.headers),
    request.headers.get("user-agent") ?? "",
    env.BETTER_AUTH_SECRET,
  );
  const { eventId } = await recordPlayEvent(db, {
    trackId,
    listenerId,
    clientHash,
    source: body.success ? body.data.source : undefined,
    collectionId: body.success ? body.data.collectionId : undefined,
    countryCode: countryFromHeaders(request.headers),
  });

  return NextResponse.json({ eventId });
}
