import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { isTrackId } from "@/server/modules/tracks/access";
import {
  AUDIO_URL_TTL_SECONDS,
  isTrackViewable,
  presignGet,
} from "@/server/modules/tracks/delivery";

export const runtime = "nodejs";

/**
 * Audio is never proxied through this server. After the visibility check we
 * redirect to a short-lived presigned R2 URL, which supports range requests
 * natively, so seeking works and no audio bytes count against Vercel bandwidth.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await params;
  if (!isTrackId(trackId)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const track = await db.track.findUnique({
    where: { id: trackId },
    select: {
      visibility: true,
      creatorId: true,
      audioAsset: { select: { bucket: true, storageKey: true, status: true } },
    },
  });
  if (
    !track ||
    track.audioAsset.status === "PENDING" ||
    !(await isTrackViewable(track, request.headers))
  ) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const url = await presignGet(track.audioAsset, AUDIO_URL_TTL_SECONDS);
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: url,
      // The redirect target embeds a signature; never let shared caches keep it.
      "Cache-Control": "private, max-age=300",
    },
  });
}
