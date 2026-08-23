export type MediaAssetKind = "audio" | "artwork";

const STORAGE_PREFIXES: Record<MediaAssetKind, string> = {
  audio: "uploads",
  artwork: "artworks",
};

export function getMediaAssetPrefix(
  kind: MediaAssetKind,
  userId: string,
): string {
  return `${STORAGE_PREFIXES[kind]}/${userId}/`;
}

export function isOwnedMediaAsset(
  storageKey: string,
  kind: MediaAssetKind,
  userId: string,
): boolean {
  return storageKey.startsWith(getMediaAssetPrefix(kind, userId));
}

export function normalizeObjectContentType(
  contentType?: string,
): string | undefined {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase();
}

export function buildPublicObjectUrl(
  baseUrl: string,
  storageKey: string,
): string {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const encodedPath = storageKey.split("/").map(encodeURIComponent).join("/");

  return new URL(encodedPath, normalizedBaseUrl).toString();
}
