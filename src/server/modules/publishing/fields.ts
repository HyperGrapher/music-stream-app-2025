import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeTags } from "@/lib/names";
import { normalizeIsrc, scheduleProblem, type TrackFields } from "@/lib/track-fields";
import { now as clockNow } from "@/server/clock";
import { appError } from "@/server/errors";
import { getEntitlements, requireEntitlement, type Plan } from "@/server/modules/plans/entitlements";

import { normalizeGenre } from "./genre";

type Db = Pick<PrismaClient, "track">;

/** Total audio time of everything the user has published (the Free upload-time quota counts this, PRD 2.3). */
export async function usedUploadMs(db: Db, userId: string): Promise<number> {
  const sum = await db.track.aggregate({ where: { creatorId: userId }, _sum: { durationMs: true } });
  return sum._sum.durationMs ?? 0;
}

/** UP-8: throws `UPLOAD_LIMIT_REACHED` when adding `addMs` of audio exceeds the user's upload time. */
export async function assertUploadQuota(db: Db, user: { id: string; plan: Plan }, addMs: number, releasedMs = 0) {
  const limit = getEntitlements(user).uploadTimeLimitMs;
  if (limit === null) return;
  const used = Math.max(0, (await usedUploadMs(db, user.id)) - releasedMs);
  if (used + addMs > limit) {
    const minutes = (ms: number) => Math.max(0, Math.ceil(ms / 60_000));
    throw appError(
      "FORBIDDEN",
      "UPLOAD_LIMIT_REACHED",
      `This needs ${minutes(addMs)} min but you have ${minutes(limit - used)} of ${minutes(limit)} min of upload time left. Delete tracks or upgrade to Pro.`,
    );
  }
}

export interface ResolvedVisibility {
  visibility: "PUBLIC" | "PRIVATE" | "SCHEDULED";
  publishAt: Date | null;
  /** First moment the track became effectively public; never moves once set (ED-2). */
  publishedAt: Date | null;
}

/**
 * Privacy transitions (PRD 7.3, ED-2): public sets `publishedAt` only the first time; scheduling is a Pro
 * entitlement and needs a time 5 minutes to a year ahead (its `publishedAt` is that time); private keeps
 * whatever `publishedAt` was. `current` is the stored state when editing.
 */
export function resolveVisibility(
  fields: Pick<TrackFields, "privacy" | "publishAt">,
  user: { plan: Plan },
  now: Date,
  current?: { visibility: "PUBLIC" | "PRIVATE" | "SCHEDULED"; publishAt: Date | null; publishedAt: Date | null },
): ResolvedVisibility {
  const privacy = fields.privacy ?? (current ? (current.visibility.toLowerCase() as "public" | "private" | "scheduled") : "public");
  const publishedAt = current?.publishedAt ?? null;
  if (privacy === "public") return { visibility: "PUBLIC", publishAt: null, publishedAt: publishedAt ?? now };
  if (privacy === "private") return { visibility: "PRIVATE", publishAt: null, publishedAt };
  const publishAt = fields.publishAt ?? current?.publishAt ?? null;
  if (!publishAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose when to publish" });
  const unchanged = current?.visibility === "SCHEDULED" && current.publishAt?.getTime() === publishAt.getTime();
  if (!unchanged) {
    requireEntitlement(user, "scheduledRelease", "Scheduled releases are a Pro feature");
    const problem = scheduleProblem(publishAt, now);
    if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
  }
  return { visibility: "SCHEDULED", publishAt, publishedAt: publishedAt ?? publishAt };
}

/** TrackFields -> Prisma columns (only the keys the caller sent), with normalisation. */
export function trackColumns(
  fields: TrackFields,
  user: { plan: Plan },
  current?: { statsPublic: boolean },
): Prisma.TrackUncheckedUpdateInput {
  if (fields.statsPublic === false && current?.statsPublic !== false) {
    requireEntitlement(user, "quietMode", "Quiet Mode (hiding stats) is a Pro feature");
  }
  const out: Prisma.TrackUncheckedUpdateInput = {};
  const set = <K extends keyof Prisma.TrackUncheckedUpdateInput>(key: K, value: Prisma.TrackUncheckedUpdateInput[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set("title", fields.title);
  set("artistName", fields.artistName === undefined ? undefined : fields.artistName?.trim() || null);
  set("featuredArtists", fields.featuredArtists === undefined ? undefined : fields.featuredArtists?.trim() || null);
  set("description", fields.description === undefined ? undefined : fields.description?.trim() || null);
  set("genre", fields.genre === undefined ? undefined : normalizeGenre(fields.genre));
  set("tags", fields.tags === undefined ? undefined : normalizeTags(fields.tags));
  set("releaseDate", fields.releaseDate);
  set("recordLabel", fields.recordLabel === undefined ? undefined : fields.recordLabel?.trim() || null);
  set("publisher", fields.publisher === undefined ? undefined : fields.publisher?.trim() || null);
  set("isrc", fields.isrc === undefined ? undefined : fields.isrc ? normalizeIsrc(fields.isrc) : null);
  set("bpm", fields.bpm);
  set("musicalKey", fields.musicalKey);
  set("explicit", fields.explicit);
  set("buyUrl", fields.buyUrl === undefined ? undefined : fields.buyUrl || null);
  set("buyTitle", fields.buyTitle === undefined ? undefined : fields.buyTitle?.trim() || null);
  set("license", fields.license as Prisma.TrackUncheckedUpdateInput["license"]);
  set("downloadable", fields.downloadable);
  set("commentsEnabled", fields.commentsEnabled);
  set("statsPublic", fields.statsPublic);
  set("embeddable", fields.embeddable);
  set("previewStartMs", fields.previewStartMs);
  return out;
}

/** Recomputes `User.publicTrackCount` (effectively public, not removed) inside the caller's transaction. */
export async function recountPublicTracks(
  tx: Pick<Prisma.TransactionClient, "track" | "user">,
  userId: string,
  now: Date = clockNow(),
) {
  const count = await tx.track.count({
    where: {
      creatorId: userId,
      moderationState: "VISIBLE",
      OR: [{ visibility: "PUBLIC" }, { visibility: "SCHEDULED", publishAt: { lte: now } }],
    },
  });
  await tx.user.update({ where: { id: userId }, data: { publicTrackCount: count } });
}
