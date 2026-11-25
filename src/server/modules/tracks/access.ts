const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTrackId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** How a request proves it may see hidden content: a track secret (`s`) or a collection secret (`c` + `s`). */
export interface AccessParams {
  secret?: string | null;
  collectionId?: string | null;
}

/** `s=<token>` / `c=<id>&s=<token>`, without a leading `?` ("" when there is nothing to prove). */
export function accessQuery(params: AccessParams | undefined): string {
  if (!params?.secret) return "";
  const query = new URLSearchParams();
  if (params.collectionId) query.set("c", params.collectionId);
  query.set("s", params.secret);
  return query.toString();
}

/** Reads the proof out of a request's query string. */
export function accessParamsFromUrl(url: URL | string): AccessParams {
  const { searchParams } = new URL(url, "http://local");
  return { secret: searchParams.get("s"), collectionId: searchParams.get("c") };
}

/** Same-origin media URLs for a track; `access` is appended so secret-link viewers can load them. */
export function trackUrls(
  trackId: string,
  { waveformVersion = 1, access }: { waveformVersion?: number; access?: AccessParams } = {},
) {
  const query = accessQuery(access);
  const withQuery = (path: string, extra = "") => {
    const parts = [extra, query].filter(Boolean).join("&");
    return parts ? `${path}?${parts}` : path;
  };
  return {
    streamUrl: withQuery(`/api/tracks/${trackId}/stream`),
    waveformUrl: withQuery(`/api/tracks/${trackId}/waveform`, `v=${waveformVersion}`),
    artworkFallbackUrl: withQuery(`/api/tracks/${trackId}/artwork`),
  };
}
