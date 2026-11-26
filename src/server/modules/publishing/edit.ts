import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { RESERVED_TRACK_SLUGS } from "@/lib/names";
import { SLUG_PATTERN, type TrackFields } from "@/lib/track-fields";
import { now as clockNow } from "@/server/clock";
import { requireEntitlement, type Plan } from "@/server/modules/plans/entitlements";
import { newSecretToken } from "@/server/modules/tokens";

import { removeAssetRows } from "../housekeeping";
import { assertUploadQuota, recountPublicTracks, resolveVisibility, trackColumns } from "./fields";
import { claimReadyAssets, loadAudio, withSlugRetry, type Publisher } from "./index";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Track not found" });

/** Loads a track the user owns (any visibility); anything else looks nonexistent. */
async function ownedTrack(db: Pick<PrismaClient, "track">, userId: string, trackId: string) {
  const track = await db.track.findFirst({ where: { id: trackId, creatorId: userId } });
  if (!track) throw notFound();
  return track;
}

/** Is `slug` free for this creator's tracks (IA-2/IA-3)? `selfId` is the track being edited. */
export async function slugAvailability(
  db: Pick<PrismaClient, "track" | "collection">,
  ownerId: string,
  kind: "TRACK" | "COLLECTION",
  slug: string,
  selfId?: string,
): Promise<{ available: boolean; reason?: "INVALID" | "RESERVED" | "TAKEN" }> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return { available: false, reason: "INVALID" };
  if (kind === "TRACK" && RESERVED_TRACK_SLUGS.has(slug)) return { available: false, reason: "RESERVED" };
  if (kind === "COLLECTION" && slug.startsWith("s-")) return { available: false, reason: "RESERVED" };
  const existing =
    kind === "TRACK"
      ? await db.track.findUnique({ where: { creatorId_slug: { creatorId: ownerId, slug } }, select: { id: true } })
      : await db.collection.findUnique({ where: { ownerId_slug: { ownerId, slug } }, select: { id: true } });
  return existing && existing.id !== selfId ? { available: false, reason: "TAKEN" } : { available: true };
}

/** Moves a permalink: the old slug keeps redirecting, taking an old slug back removes its redirect (IA-4, ED-5). */
export async function renameSlug(
  tx: Prisma.TransactionClient,
  ownerId: string,
  kind: "TRACK" | "COLLECTION",
  targetId: string,
  oldSlug: string,
  newSlug: string,
) {
  await tx.slugRedirect.deleteMany({ where: { ownerId, kind, oldSlug: newSlug } });
  await tx.slugRedirect.upsert({
    where: { ownerId_kind_oldSlug: { ownerId, kind, oldSlug } },
    create: { ownerId, kind, oldSlug, targetId },
    update: { targetId },
  });
}

export type TrackUpdate = TrackFields;

/**
 * Edits a track the user owns (PRD 7.5): any field, privacy transitions (first public sets
 * `publishedAt` once and posts the activity; ED-2), permalink change with redirect (ED-5), artwork swap
 * (the old artwork is queued for deletion when nobody else uses it).
 */
export async function updateTrack(db: PrismaClient, user: Publisher, trackId: string, fields: TrackUpdate) {
  const at = clockNow();
  const result = await withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const current = await ownedTrack(tx, user.id, trackId);
      const data = trackColumns(fields, user, current);

      if (fields.privacy !== undefined || fields.publishAt !== undefined) {
        const resolved = resolveVisibility(fields, user, at, current);
        Object.assign(data, resolved);
        const becameVisible = current.publishedAt === null && resolved.publishedAt !== null && resolved.visibility !== "PRIVATE";
        if (becameVisible) {
          const inCollection = await tx.collectionTrack.count({ where: { trackId } });
          const posted = await tx.activity.count({ where: { trackId, type: "TRACK_POSTED" } });
          if (!inCollection && !posted) {
            await tx.activity.create({ data: { actorId: user.id, type: "TRACK_POSTED", trackId, createdAt: resolved.publishAt ?? at } });
          }
        }
        // Rescheduling moves the feed entry with it.
        if (resolved.visibility === "SCHEDULED" && resolved.publishAt) {
          await tx.activity.updateMany({ where: { trackId, type: "TRACK_POSTED" }, data: { createdAt: resolved.publishAt } });
        }
      }

      if (fields.slug && fields.slug !== current.slug) {
        const availability = await slugAvailability(tx, user.id, "TRACK", fields.slug, trackId);
        if (!availability.available) {
          throw new TRPCError({ code: availability.reason === "TAKEN" ? "CONFLICT" : "BAD_REQUEST", message: availability.reason === "TAKEN" ? "That permalink is taken" : "That permalink isn't allowed" });
        }
        data.slug = fields.slug;
        await renameSlug(tx, user.id, "TRACK", trackId, current.slug, fields.slug);
      }

      let obsoleteArtwork: string | null = null;
      if (fields.artworkAssetId !== undefined && fields.artworkAssetId !== current.artworkAssetId) {
        if (fields.artworkAssetId) await claimReadyAssets(tx, user.id, [fields.artworkAssetId], "IMAGE", at);
        data.artworkAssetId = fields.artworkAssetId;
        obsoleteArtwork = current.artworkAssetId;
      }
      if (data.previewStartMs !== undefined && typeof data.previewStartMs === "number") {
        data.previewStartMs = Math.min(data.previewStartMs, Math.max(0, current.durationMs - 30_000));
      }

      const updated = await tx.track.update({ where: { id: trackId }, data });
      await recountPublicTracks(tx, user.id, at);
      return { track: updated, obsoleteArtwork };
    }),
  );
  if (result.obsoleteArtwork) await removeAssetIfUnused(db, result.obsoleteArtwork);
  return result.track;
}

/** Deletes an image asset (and queues its renditions) unless something still shows it. */
async function removeAssetIfUnused(db: PrismaClient, assetId: string) {
  const [tracks, collections, users] = await Promise.all([
    db.track.count({ where: { OR: [{ artworkAssetId: assetId }, { audioAssetId: assetId }] } }),
    db.collection.count({ where: { artworkAssetId: assetId } }),
    db.user.count({ where: { OR: [{ avatarAssetId: assetId }, { bannerAssetId: assetId }] } }),
  ]);
  if (tracks + collections + users > 0) return;
  const claimed = await db.mediaAsset.updateMany({ where: { id: assetId, status: "ATTACHED" }, data: { status: "DELETING" } });
  if (claimed.count === 1) await removeAssetRows(db, [assetId]);
}

/** IA-5: a new secret token invalidates the old link immediately. */
export async function resetTrackSecret(db: PrismaClient, userId: string, trackId: string) {
  await ownedTrack(db, userId, trackId);
  const secretToken = newSecretToken();
  await db.track.update({ where: { id: trackId }, data: { secretToken } });
  return { secretToken };
}

/** What deleting a track takes with it, for the confirmation dialog (ED-4). */
export async function trackDeleteImpact(db: PrismaClient, userId: string, trackId: string) {
  const track = await ownedTrack(db, userId, trackId);
  const [comments, likes, reposts, collections] = await Promise.all([
    db.comment.count({ where: { trackId } }),
    db.trackLike.count({ where: { trackId } }),
    db.trackRepost.count({ where: { trackId } }),
    db.collectionTrack.count({ where: { trackId } }),
  ]);
  return { title: track.title, comments, likes, reposts, collections, plays: track.playCount };
}

export const collectionLockKey = (collectionId: string) => `collection:${collectionId}`;

/** Re-derives a collection's dense positions and totals (PRD 16.4); call under its advisory lock. */
export async function normaliseCollection(tx: Prisma.TransactionClient, collectionId: string) {
  await tx.$executeRaw`
    UPDATE "collection_track" ct SET "position" = r.pos
    FROM (SELECT "trackId", row_number() OVER (ORDER BY "position", "addedAt", "trackId") - 1 AS pos
          FROM "collection_track" WHERE "collectionId" = ${collectionId}) r
    WHERE ct."collectionId" = ${collectionId} AND ct."trackId" = r."trackId"`;
  await tx.$executeRaw`
    UPDATE "collection" c SET
      "trackCount" = (SELECT count(*) FROM "collection_track" x WHERE x."collectionId" = c."id"),
      "durationMs" = COALESCE((SELECT sum(t."durationMs") FROM "collection_track" x JOIN "track" t ON t."id" = x."trackId" WHERE x."collectionId" = c."id"), 0),
      "updatedAt" = now()
    WHERE c."id" = ${collectionId}`;
}

export async function lockCollection(tx: Prisma.TransactionClient, collectionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${collectionLockKey(collectionId)}, 0))`;
}

/**
 * ED-4: deletes a track with its likes, comments, activity and notifications (cascade), removes it from
 * every collection (positions renumbered under the collection's lock) and queues its audio, waveform and
 * artwork for deletion unless another track still uses them.
 */
export async function deleteTrack(db: PrismaClient, userId: string, trackId: string) {
  const at = clockNow();
  const { audioAssetId, artworkAssetId } = await db.$transaction(async (tx) => {
    const track = await ownedTrack(tx, userId, trackId);
    const memberships = await tx.collectionTrack.findMany({ where: { trackId }, select: { collectionId: true }, orderBy: { collectionId: "asc" } });
    for (const { collectionId } of memberships) await lockCollection(tx, collectionId);
    await tx.track.delete({ where: { id: trackId } });
    for (const { collectionId } of memberships) await normaliseCollection(tx, collectionId);
    await tx.spotlightItem.deleteMany({ where: { trackId } });
    await recountPublicTracks(tx, userId, at);
    return track;
  });
  await removeAssetIfUnused(db, audioAssetId);
  if (artworkAssetId) await removeAssetIfUnused(db, artworkAssetId);
  return { ok: true };
}

/**
 * ED-3 (Pro): swaps the audio file of a track. Comments, likes, plays and the URL stay; duration,
 * waveform and mime type follow the new file and the preview start is clamped. The upload-time quota
 * is checked against the difference.
 */
export async function replaceTrackAudio(db: PrismaClient, user: Publisher & { plan: Plan }, trackId: string, mediaAssetId: string) {
  requireEntitlement(user, "replaceAudio", "Replacing the audio file is a Pro feature");
  const at = clockNow();
  const { oldAudioId } = await db.$transaction(async (tx) => {
    const track = await ownedTrack(tx, user.id, trackId);
    const audio = (await loadAudio(tx, user.id, [mediaAssetId])).get(mediaAssetId)!;
    await assertUploadQuota(tx, user, audio.durationMs, track.durationMs);
    await claimReadyAssets(tx, user.id, [mediaAssetId], "AUDIO", at);
    await tx.track.update({
      where: { id: trackId },
      data: {
        audioAssetId: mediaAssetId,
        durationMs: audio.durationMs,
        mimeType: audio.mimeType,
        previewStartMs: Math.min(track.previewStartMs, Math.max(0, audio.durationMs - 30_000)),
      },
    });
    const memberships = await tx.collectionTrack.findMany({ where: { trackId }, select: { collectionId: true }, orderBy: { collectionId: "asc" } });
    for (const { collectionId } of memberships) {
      await lockCollection(tx, collectionId);
      await normaliseCollection(tx, collectionId);
    }
    return { oldAudioId: track.audioAssetId };
  });
  await removeAssetIfUnused(db, oldAudioId);
  return { ok: true };
}
