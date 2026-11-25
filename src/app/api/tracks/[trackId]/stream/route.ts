import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import {
  AUDIO_URL_TTL_SECONDS,
  getViewerId,
  presignGet,
} from "@/server/modules/tracks/delivery";
import { trackAccessSelect } from "@/server/modules/visibility";

export const runtime = "nodejs";

/**
 * Audio is never proxied through this server. After the visibility check we
 * redirect to a short-lived presigned R2 URL, which supports range requests
 * natively, so seeking works and no audio bytes count against Vercel bandwidth.
 * Hidden tracks need the owner's session or a secret link (`?s=` / `?c=&s=`).
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
      ...trackAccessSelect,
      audioAsset: { select: { bucket: true, storageKey: true, status: true } },
    },
  });
  const access =
    track &&
    track.audioAsset.status !== "PENDING" &&
    (await authorizeTrack(db, track, {
      ...accessParamsFromUrl(request.url),
      viewerId: await getViewerId(request.headers),
    }));
  if (!track || !access) {
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
