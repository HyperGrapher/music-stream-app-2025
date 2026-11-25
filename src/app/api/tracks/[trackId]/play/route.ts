import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db";
import { isTrackId } from "@/server/modules/tracks/access";
import { getViewerId, isTrackViewable } from "@/server/modules/tracks/delivery";
import {
  clientIpFromHeaders,
  computeClientHash,
  recordPlay,
} from "@/server/modules/tracks/plays";

export const runtime = "nodejs";

/**
 * Called by the player after a few seconds of actual listening. Always answers
 * 204 for a viewable track whether or not the play was counted (deduped plays
 * are indistinguishable to the caller), so the counter gives no oracle for abuse.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await params;
  if (!isTrackId(trackId)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const track = await db.track.findUnique({
    where: { id: trackId },
    select: { visibility: true, creatorId: true },
  });
  if (!track || !(await isTrackViewable(track, request.headers))) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const listenerId = await getViewerId(request.headers);
  const clientHash = computeClientHash(
    clientIpFromHeaders(request.headers),
    request.headers.get("user-agent") ?? "",
    env.BETTER_AUTH_SECRET,
  );
  await recordPlay(db, { trackId, listenerId, clientHash });

  return new NextResponse(null, { status: 204 });
}
