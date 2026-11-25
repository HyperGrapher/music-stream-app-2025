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

export type ImagePurpose = "ARTWORK" | "AVATAR" | "BANNER";

/**
 * Renditions per purpose (PRD NF-3). `aspect` is width / height of every rendition: artwork and
 * avatars are square, banners are a 2480x520 strip.
 */
export const IMAGE_SPECS = {
  ARTWORK: { widths: ARTWORK_WIDTHS, aspect: 1 },
  AVATAR: { widths: [64, 160, 320], aspect: 1 },
  BANNER: { widths: [1240, 2480], aspect: 2480 / 520 },
} as const satisfies Record<ImagePurpose, { widths: readonly number[]; aspect: number }>;

/**
 * The widths to render when the largest crop of the source is `maxWidth` px wide. Never upscales:
 * a small image gets the standard widths below its size plus one rendition at its own size.
 */
export function planImageWidths(standard: readonly number[], maxWidth: number): number[] {
  const available = Math.floor(maxWidth);
  if (!Number.isFinite(available) || available < 1) return [];
  const widths: number[] = standard.filter((width) => width <= available);
  const top = Math.min(available, standard.at(-1)!);
  if (widths.at(-1) !== top) widths.push(top);
  return widths;
}

/** Widths for a source of `width` x `height` px cropped to the purpose's aspect ratio. */
export function planImageWidthsFor(purpose: ImagePurpose, width: number, height: number): number[] {
  const { widths, aspect } = IMAGE_SPECS[purpose];
  return planImageWidths(widths, Math.min(width, height * aspect));
}

/** Square artwork: `shortSide` is the shorter side of the source. */
export function planArtworkWidths(shortSide: number): number[] {
  return planImageWidths(ARTWORK_WIDTHS, shortSide);
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
  const joiner = fallbackUrl.includes("?") ? "&" : "?";
  const urlFor = (width: number) =>
    asset.publicUrl ? withArtworkWidth(asset.publicUrl, width) : `${fallbackUrl}${joiner}w=${width}`;
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
