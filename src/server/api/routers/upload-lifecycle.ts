export type MediaAssetKind = "audio" | "artwork";

const STORAGE_PREFIXES: Record<MediaAssetKind, string> = {
  audio: "uploads",
  artwork: "artworks",
};

/** Folders processed images end up in, by purpose (originals are always uploaded under `artworks/`). */
export const IMAGE_BASE_PREFIX = { ARTWORK: "artworks", AVATAR: "avatars", BANNER: "banners" } as const;

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

/** An image (any purpose, original or processed) stored in the owner's own folder. */
export function isOwnedImage(storageKey: string, userId: string): boolean {
  return Object.values(IMAGE_BASE_PREFIX).some((prefix) => storageKey.startsWith(`${prefix}/${userId}/`));
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
