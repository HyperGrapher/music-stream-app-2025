import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { auth } from "@/lib/auth";
import { r2Client } from "@/lib/r2";
import { canAccessTrack, type TrackVisibility } from "./access";

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
 * Applies visibility rules to a loaded track. Callers answer 404 (not 403) when
 * this is false so private tracks are not discoverable by probing ids.
 */
export async function isTrackViewable(
  track: { visibility: TrackVisibility; creatorId: string },
  headers: Headers,
): Promise<boolean> {
  if (track.visibility !== "PRIVATE") return true;
  return canAccessTrack(track, await getViewerId(headers));
}
