import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { auth } from "@/lib/auth";
import { r2Client } from "@/lib/r2";

export const AUDIO_URL_TTL_SECONDS = 60 * 60;
export const ARTWORK_URL_TTL_SECONDS = 60 * 60;

export async function getViewerId(headers: Headers): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user.id ?? null;
}

export function presignGet(
  asset: { bucket: string; storageKey: string },
  expiresIn: number,
) {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: asset.bucket, Key: asset.storageKey }),
    { expiresIn },
  );
}

/**
 * A presigned URL that stays identical for `windowSeconds` (signed at the start of the window,
 * valid for two windows), so browsers can cache the object behind it instead of downloading it
 * again for every new signature. Always valid for at least one more window.
 */
export function presignGetStable(
  asset: { bucket: string; storageKey: string },
  windowSeconds: number,
  now = Date.now(),
) {
  const windowMs = windowSeconds * 1000;
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: asset.bucket, Key: asset.storageKey }),
    { expiresIn: windowSeconds * 2, signingDate: new Date(Math.floor(now / windowMs) * windowMs) },
  );
}
