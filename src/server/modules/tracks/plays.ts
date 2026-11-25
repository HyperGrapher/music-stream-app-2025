import { createHmac } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";

/** A listener (or anonymous client) counts at most once per track in this window. */
export const PLAY_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/**
 * Anonymous listeners are identified by a keyed hash of ip + user agent. Keyed
 * (HMAC) so the stored value cannot be reversed or correlated across deployments,
 * and the raw ip/user agent are never persisted.
 */
export function computeClientHash(
  ip: string,
  userAgent: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${ip}\n${userAgent}`)
    .digest("hex");
}

export function clientIpFromHeaders(headers: Headers): string {
  // Vercel sets x-forwarded-for; the first entry is the client.
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

interface RecordPlayInput {
  trackId: string;
  /** Signed-in listener, if any. Takes precedence over clientHash for deduping. */
  listenerId: string | null;
  clientHash: string;
  now?: Date;
}

/**
 * Records one play unless this listener already counted for the track inside the
 * dedupe window. Returns whether the play was counted. A transaction-scoped
 * advisory lock serialises concurrent requests for the same listener+track, so
 * parallel calls cannot both pass the "recent play" check.
 */
export async function recordPlay(
  db: PrismaClient,
  { trackId, listenerId, clientHash, now = new Date() }: RecordPlayInput,
): Promise<boolean> {
  const identity = listenerId ?? clientHash;
  const since = new Date(now.getTime() - PLAY_DEDUPE_WINDOW_MS);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`play:${trackId}:${identity}`}, 0))`;

    const recent = await tx.playEvent.findFirst({
      where: {
        trackId,
        createdAt: { gte: since },
        ...(listenerId ? { listenerId } : { listenerId: null, clientHash }),
      },
      select: { id: true },
    });
    if (recent) return false;

    await tx.playEvent.create({
      data: {
        trackId,
        listenerId,
        clientHash: listenerId ? null : clientHash,
        createdAt: now,
      },
    });
    await tx.track.update({
      where: { id: trackId },
      data: { playCount: { increment: 1 } },
    });
    return true;
  });
}
