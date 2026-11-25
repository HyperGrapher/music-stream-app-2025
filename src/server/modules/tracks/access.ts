export type TrackVisibility = "PUBLIC" | "UNLISTED" | "PRIVATE";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrackId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Who may play a track (and fetch its waveform/artwork):
 * - PUBLIC and UNLISTED: anyone holding the link (unlisted only differs in discovery)
 * - PRIVATE: the creator only
 */
export function canAccessTrack(
  track: { visibility: TrackVisibility; creatorId: string },
  viewerId: string | null | undefined,
): boolean {
  if (track.visibility !== "PRIVATE") return true;
  return !!viewerId && viewerId === track.creatorId;
}

/** Only fully public content may be cached by shared caches / CDNs. */
export function cacheControlFor(visibility: TrackVisibility, maxAgeSeconds: number) {
  return visibility === "PUBLIC"
    ? `public, max-age=${maxAgeSeconds}, immutable`
    : "private, no-store";
}

export function trackUrls(trackId: string, waveformVersion = 1) {
  return {
    streamUrl: `/api/tracks/${trackId}/stream`,
    waveformUrl: `/api/tracks/${trackId}/waveform?v=${waveformVersion}`,
    artworkFallbackUrl: `/api/tracks/${trackId}/artwork`,
  };
}
