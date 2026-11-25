import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { isTrackId } from "@/server/modules/tracks/access";
import {
  ARTWORK_URL_TTL_SECONDS,
  isTrackViewable,
  presignGet,
} from "@/server/modules/tracks/delivery";

export const runtime = "nodejs";

/** Fallback for artwork without a configured public base URL: presigned redirect. */
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
      artworkAsset: {
        select: { bucket: true, storageKey: true, publicUrl: true },
      },
    },
  });
  if (!track?.artworkAsset || !(await isTrackViewable(track, request.headers))) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const { artworkAsset } = track;
  const location =
    artworkAsset.publicUrl ??
    (await presignGet(artworkAsset, ARTWORK_URL_TTL_SECONDS));
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "private, max-age=300" },
  });
}
