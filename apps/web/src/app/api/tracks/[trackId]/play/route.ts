import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { isTrackId } from "@/server/modules/tracks/access";
import { getViewerId, isTrackViewable } from "@/server/modules/tracks/delivery";

export const runtime = "nodejs";

/** Called by the player once per playback start (not per range request). */
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
  await db.$transaction([
    db.track.update({
      where: { id: trackId },
      data: { playCount: { increment: 1 } },
    }),
    db.playEvent.create({ data: { trackId, listenerId } }),
  ]);

  return new NextResponse(null, { status: 204 });
}
