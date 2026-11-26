import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/server/db";
import { bumpTrackDailyStat } from "@/server/modules/stats";
import { consumeRateLimit } from "@/server/modules/rate-limit";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import { getViewerId, presignDownload } from "@/server/modules/tracks/delivery";
import { trackAccessSelect } from "@/server/modules/visibility";

export const runtime = "nodejs";

const DAY_SECONDS = 24 * 60 * 60;

/**
 * DL-1: the original file of a track whose creator allows downloads, for signed-in listeners only.
 * Same visibility rules as streaming. A listener counts once per track per 24 hours; the owner's own
 * downloads never count. Redirects to a short-lived presigned attachment URL (nothing is proxied).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  if (!isTrackId(trackId)) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const viewerId = await getViewerId(request.headers);
  if (!viewerId) return NextResponse.json({ error: "Sign in to download" }, { status: 401 });

  const track = await db.track.findUnique({
    where: { id: trackId },
    select: {
      ...trackAccessSelect,
      title: true,
      downloadable: true,
      creatorId: true,
      audioAsset: { select: { bucket: true, storageKey: true, status: true, originalFilename: true } },
    },
  });
  const access = track && track.audioAsset.status !== "PENDING" && (await authorizeTrack(db, track, { ...accessParamsFromUrl(request.url), viewerId }));
  if (!track || !access) return NextResponse.json({ error: "Track not found" }, { status: 404 });
  if (!track.downloadable && track.creatorId !== viewerId) return NextResponse.json({ error: "Downloads are turned off for this track" }, { status: 403 });

  if (track.creatorId !== viewerId) {
    const first = await consumeRateLimit(db, `download:${viewerId}:${trackId}`, { max: 1, windowSeconds: DAY_SECONDS });
    if (first.ok) {
      await db.$transaction(async (tx) => {
        await tx.track.update({ where: { id: trackId }, data: { downloadCount: { increment: 1 } } });
        await bumpTrackDailyStat(tx, trackId, "downloads", 1, new Date());
      });
    }
  }

  const extension = /\.[a-z0-9]{2,5}$/i.exec(track.audioAsset.originalFilename ?? "")?.[0] ?? "";
  const url = await presignDownload(track.audioAsset, `${track.title}${extension}`);
  return new NextResponse(null, { status: 307, headers: { Location: url, "Cache-Control": "private, no-store" } });
}
