import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

import { artworkVariantKey, IMAGE_SPECS, planImageWidthsFor, type ImagePurpose } from "@/lib/artwork";

/** Larger sources are refused before decoding (about 7000 x 7000), which bounds memory. */
export const MAX_ARTWORK_INPUT_PIXELS = 50_000_000;
const WEBP_QUALITY = 80;

export class InvalidArtworkError extends Error {
  constructor(message = "The file could not be read as an image", options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidArtworkError";
  }
}

export interface ArtworkRendition {
  width: number;
  data: Buffer;
}

/**
 * Centre-cropped WebP renditions for an image purpose (square artwork and avatars, 2480x520
 * banners; the UI shows them in boxes with `object-cover`, so this is the same crop without the
 * bytes nobody sees). EXIF orientation is applied and metadata is stripped.
 */
export async function renderImageRenditions(
  input: Buffer,
  purpose: ImagePurpose = "ARTWORK",
): Promise<ArtworkRendition[]> {
  const options = {
    autoOrient: true,
    failOn: "error",
    limitInputPixels: MAX_ARTWORK_INPUT_PIXELS,
  } as const;
  const { aspect } = IMAGE_SPECS[purpose];
  let widths: number[];
  try {
    const { width = 0, height = 0, orientation = 1 } = await sharp(input, options).metadata();
    // Metadata reports the stored size; orientations 5-8 display it rotated by 90 degrees.
    const [w, h] = orientation >= 5 ? [height, width] : [width, height];
    widths = planImageWidthsFor(purpose, w, h);
  } catch (error) {
    throw new InvalidArtworkError(undefined, { cause: error });
  }
  if (widths.length === 0) throw new InvalidArtworkError();

  try {
    return await Promise.all(
      widths.map(async (width) => ({
        width,
        data: await sharp(input, options)
          .resize(width, Math.round(width / aspect), { fit: "cover", position: "centre" })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer(),
      })),
    );
  } catch (error) {
    throw new InvalidArtworkError(undefined, { cause: error });
  }
}

/** Square artwork renditions (kept for existing callers and tests). */
export const renderArtworkRenditions = (input: Buffer) => renderImageRenditions(input, "ARTWORK");

export interface ProcessedArtwork {
  /** Key of the largest rendition; the new `MediaAsset.storageKey`. */
  storageKey: string;
  imageWidths: number[];
  /** Total bytes of all renditions. */
  byteSize: number;
  mimeType: "image/webp";
}

/**
 * Reads `sourceKey`, writes the renditions under `base/` and returns what to store on the asset.
 * Keys are derived from `base` (the asset id), so a retried or duplicated call overwrites the
 * same objects instead of leaking new ones. The source is NOT deleted here: callers delete it
 * once the database points at the renditions.
 */
export async function processImageObject(
  r2: S3Client,
  input: { bucket: string; sourceKey: string; base: string; purpose?: ImagePurpose },
): Promise<ProcessedArtwork> {
  const object = await r2.send(new GetObjectCommand({ Bucket: input.bucket, Key: input.sourceKey }));
  if (!object.Body) throw new InvalidArtworkError("The uploaded image is empty");
  const source = Buffer.from(await object.Body.transformToByteArray());

  const renditions = await renderImageRenditions(source, input.purpose ?? "ARTWORK");
  await Promise.all(
    renditions.map(({ width, data }) =>
      r2.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: artworkVariantKey(input.base, width),
          Body: data,
          ContentType: "image/webp",
          // Each rendition key is written once per asset and never changes.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      ),
    ),
  );

  const largest = renditions.at(-1)!;
  return {
    storageKey: artworkVariantKey(input.base, largest.width),
    imageWidths: renditions.map((r) => r.width),
    byteSize: renditions.reduce((sum, r) => sum + r.data.length, 0),
    mimeType: "image/webp",
  };
}

export const processArtworkObject = processImageObject;

/** Deletes several objects (one request each; R2 objects here are few and small). */
export async function deleteObjects(r2: S3Client, bucket: string, keys: string[]) {
  await Promise.all(
    keys.map((Key) => r2.send(new DeleteObjectCommand({ Bucket: bucket, Key }))),
  );
}
