import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse, type NextRequest } from "next/server";

import { r2Client } from "@/lib/r2";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import { db } from "@/server/db";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import { getViewerId } from "@/server/modules/tracks/delivery";
import { cacheControlFor, trackAccessSelect } from "@/server/modules/visibility";

export const runtime = "nodejs";

// Waveform JSON is small (tens of KB), so it is streamed through the function
// instead of presigned: the browser reads it with fetch() and R2 would need CORS.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> },
) {
  const { trackId } = await params;
  if (!isTrackId(trackId)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  try {
    const track = await db.track.findUnique({
      where: { id: trackId },
      select: {
        ...trackAccessSelect,
        audioAsset: {
          select: {
            audioAnalysis: {
              select: {
                status: true,
                overviewWaveformAsset: {
                  select: { bucket: true, storageKey: true, mimeType: true },
                },
              },
            },
          },
        },
      },
    });
    const access =
      track &&
      (await authorizeTrack(db, track, {
        ...accessParamsFromUrl(request.url),
        viewerId: await getViewerId(request.headers),
      }));
    if (!track || !access) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const analysis = track.audioAsset.audioAnalysis;
    const waveformAsset = analysis?.overviewWaveformAsset;
    if (analysis?.status !== "READY" || !waveformAsset) {
      return NextResponse.json(
        { status: analysis?.status ?? "FAILED" },
        { status: 202 },
      );
    }

    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: waveformAsset.bucket,
        Key: waveformAsset.storageKey,
      }),
    );
    if (!object.Body) throw new Error("Waveform storage returned no body");

    return new NextResponse(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": object.ContentType ?? waveformAsset.mimeType,
        ...(object.ContentLength !== undefined && {
          "Content-Length": String(object.ContentLength),
        }),
        "Cache-Control": cacheControlFor(access, 31536000),
      },
    });
  } catch (error) {
    console.error(`Waveform request failed for track ${trackId}`, error);
    return NextResponse.json({ error: "Unable to load waveform" }, { status: 502 });
  }
}
