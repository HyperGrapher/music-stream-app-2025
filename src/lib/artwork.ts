/**
 * Processed artwork: every uploaded image is centre-cropped to a square and stored as WebP at a
 * few widths, and the original is deleted. The largest rendition is 640 px, enough for the
 * biggest artwork box in the UI (the track page: 320 px on desktop, full width below 768 px)
 * on a 2x screen.
 *
 * Storage layout: `<base>/<width>.webp`, e.g. `artworks/<userId>/<assetId>/320.webp`. The asset's
 * `storageKey` is its largest rendition and `imageWidths` lists the others.
 */

export const ARTWORK_WIDTHS = [96, 320, 640] as const;
export const ARTWORK_MAX_WIDTH = 640;

/**
 * The widths to render for a source image whose shorter side is `shortSide` px. Never upscales:
 * a small image gets the standard widths below its size plus one rendition at its own size.
 */
export function planArtworkWidths(shortSide: number): number[] {
  const side = Math.floor(shortSide);
  if (!Number.isFinite(side) || side < 1) return [];
  const widths: number[] = ARTWORK_WIDTHS.filter((width) => width <= side);
  const top = Math.min(side, ARTWORK_MAX_WIDTH);
  if (widths.at(-1) !== top) widths.push(top);
  return widths;
}

export const artworkVariantKey = (base: string, width: number) => `${base}/${width}.webp`;

const RENDITION_SUFFIX = /\/\d+\.webp$/;

/** Swaps the width in a rendition key or URL (`.../640.webp` -> `.../96.webp`). */
export function withArtworkWidth(keyOrUrl: string, width: number): string {
  return RENDITION_SUFFIX.test(keyOrUrl)
    ? keyOrUrl.replace(RENDITION_SUFFIX, `/${width}.webp`)
    : keyOrUrl;
}

/** Every R2 object behind an image asset (all renditions, or the single legacy object). */
export function imageObjectKeys(asset: { storageKey: string; imageWidths?: number[] | null }) {
  const widths = asset.imageWidths ?? [];
  return widths.length > 0
    ? widths.map((width) => withArtworkWidth(asset.storageKey, width))
    : [asset.storageKey];
}

export interface ArtworkSource {
  publicUrl: string | null;
  imageWidths: number[];
}

export interface ArtworkUrls {
  artworkUrl: string | null;
  /** `srcset` for `<img>`; null for legacy images that only exist in one size. */
  artworkSrcSet: string | null;
}

/**
 * Client URLs for a track's artwork: the public bucket URL when one is configured, otherwise the
 * app's redirect route (`?w=` picks a rendition). `artworkUrl` is the largest rendition.
 */
export function artworkUrls(
  asset: ArtworkSource | null | undefined,
  fallbackUrl: string,
): ArtworkUrls {
  if (!asset) return { artworkUrl: null, artworkSrcSet: null };
  const widths = [...asset.imageWidths].sort((a, b) => a - b);
  if (widths.length === 0) {
    return { artworkUrl: asset.publicUrl ?? fallbackUrl, artworkSrcSet: null };
  }
  const urlFor = (width: number) =>
    asset.publicUrl ? withArtworkWidth(asset.publicUrl, width) : `${fallbackUrl}?w=${width}`;
  return {
    artworkUrl: urlFor(widths.at(-1)!),
    artworkSrcSet: widths.map((width) => `${urlFor(width)} ${width}w`).join(", "),
  };
}

/** `sizes` values for each place artwork is shown, matching the CSS boxes. */
export const ARTWORK_SIZES = {
  /** Player bar thumbnail, w-10. */
  thumbnail: "40px",
  /** Track page: 320 px column from md up, full width (minus padding) below. */
  hero: "(min-width: 768px) 320px, calc(100vw - 48px)",
  /** Track grid card: 2/3/4/6 columns inside a 1240 px page. */
  card: "(min-width: 1280px) 200px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw",
  /** Waveform list row: h-32 (h-28 compact), h-40 from lg. */
  listItem: "(min-width: 1024px) 160px, 128px",
  /** Blurred backdrop behind the track page hero: the smallest rendition is plenty. */
  backdrop: "96px",
} as const;
