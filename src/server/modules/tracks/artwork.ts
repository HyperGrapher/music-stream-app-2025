import { artworkUrls, type ArtworkUrls } from "@/lib/artwork";

import { trackUrls } from "./access";

/** Prisma select for a track's artwork asset. */
export const artworkAssetSelect = {
  select: { publicUrl: true, imageWidths: true },
} as const;

/** `artworkUrl` + `artworkSrcSet` for a track (null when it has no artwork). */
export function trackArtwork(
  trackId: string,
  asset: { publicUrl: string | null; imageWidths: number[] } | null | undefined,
): ArtworkUrls {
  return artworkUrls(asset, trackUrls(trackId).artworkFallbackUrl);
}
