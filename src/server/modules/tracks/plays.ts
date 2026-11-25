import { createHmac } from "node:crypto";

import type { PlaySource, PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { bumpTrackDailyStat } from "@/server/modules/stats";

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

/** ISO 3166 alpha-2 from Vercel's geo header; null locally or when it is malformed (A6). */
export function countryFromHeaders(headers: Headers): string | null {
  const value = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

interface RecordPlayInput {
  trackId: string;
  /** Signed-in listener, if any. Takes precedence over clientHash for deduping. */
  listenerId: string | null;
  clientHash: string;
  source?: PlaySource;
  /** Collection the track was played from; its own play counter moves with the track's. */
  collectionId?: string | null;
  countryCode?: string | null;
  now?: Date;
}

/**
 * Records one play unless this listener already played the track inside the dedupe window.
 * Returns whether the play was counted. A transaction-scoped advisory lock serialises concurrent
 * requests for the same listener+track, so parallel calls cannot both pass the "recent play"
 * check. The owner's own plays are stored (history) but never counted (PL-P9).
 */
export async function recordPlay(
  db: PrismaClient,
  {
    trackId,
    listenerId,
    clientHash,
    source = "OTHER",
    collectionId = null,
    countryCode = null,
    now = clockNow(),
  }: RecordPlayInput,
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

    const track = await tx.track.findUnique({ where: { id: trackId }, select: { creatorId: true } });
    if (!track) return false;
    const counted = track.creatorId !== listenerId;

    // A collection only gets credit when it really contains the track.
    const credited = collectionId
      ? await tx.collectionTrack.findUnique({
          where: { collectionId_trackId: { collectionId, trackId } },
          select: { collectionId: true },
        })
      : null;

    await tx.playEvent.create({
      data: {
        trackId,
        listenerId,
        clientHash: listenerId ? null : clientHash,
        collectionId: credited?.collectionId ?? null,
        source,
        countryCode,
        counted,
        createdAt: now,
      },
    });
    if (!counted) return false;

    await tx.track.update({ where: { id: trackId }, data: { playCount: { increment: 1 } } });
    await bumpTrackDailyStat(tx, trackId, "plays", 1, now);
    if (credited) {
      await tx.collection.update({ where: { id: credited.collectionId }, data: { playCount: { increment: 1 } } });
    }
    return true;
  });
}
