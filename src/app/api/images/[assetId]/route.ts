import { NextResponse, type NextRequest } from "next/server";

import { withArtworkWidth } from "@/lib/artwork";
import { now } from "@/server/clock";
import { db } from "@/server/db";
import { accessParamsFromUrl, isTrackId } from "@/server/modules/tracks/access";
import {
  ARTWORK_URL_TTL_SECONDS,
  getViewerId,
  presignGetStable,
} from "@/server/modules/tracks/delivery";
import {
  collectionAccess,
  collectionAccessSelect,
  trackAccess,
  trackAccessSelect,
} from "@/server/modules/visibility";

export const runtime = "nodejs";

/**
 * Generic image delivery (avatars, banners, collection and track artwork): checks that the asset
 * belongs to something the viewer may see, then redirects to a presigned (or public) rendition.
 * `?w=` picks a rendition; `?c=<collectionId>&s=<token>` proves a collection secret link.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  if (!isTrackId(assetId)) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const asset = await db.mediaAsset.findFirst({
    where: { id: assetId, kind: "IMAGE", status: "ATTACHED" },
    select: {
      bucket: true,
      storageKey: true,
      publicUrl: true,
      imageWidths: true,
      usersAsAvatar: { select: { status: true }, take: 1 },
      usersAsBanner: { select: { status: true }, take: 1 },
      collectionArtwork: { select: collectionAccessSelect, take: 1 },
      trackArtwork: { select: trackAccessSelect, take: 1 },
    },
  });
  if (!asset) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const params2 = accessParamsFromUrl(request.url);
  const viewerId = await getViewerId(request.headers);
  const at = now();
  const profile = [...asset.usersAsAvatar, ...asset.usersAsBanner].some((u) => u.status === "ACTIVE");
  const collection = asset.collectionArtwork[0];
  const track = asset.trackArtwork[0];
  const allowed =
    profile ||
    (collection !== undefined &&
      collectionAccess(collection, { viewerId, secret: params2.collectionId === collection.id ? params2.secret : null }) !== null) ||
    (track !== undefined && trackAccess(track, { viewerId, now: at, secret: params2.secret }) !== null);
  if (!allowed) return NextResponse.json({ error: "Image not found" }, { status: 404 });

  const requested = Number(request.nextUrl.searchParams.get("w"));
  const width = asset.imageWidths.includes(requested) ? requested : undefined;
  const storageKey = width ? withArtworkWidth(asset.storageKey, width) : asset.storageKey;
  const location = asset.publicUrl
    ? width
      ? withArtworkWidth(asset.publicUrl, width)
      : asset.publicUrl
    : await presignGetStable({ bucket: asset.bucket, storageKey }, ARTWORK_URL_TTL_SECONDS);
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": "private, max-age=300" },
  });
}
