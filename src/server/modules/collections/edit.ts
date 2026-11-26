import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { isReleaseType, MAX_COLLECTION_TRACKS, releaseDateProblem, type CollectionFields } from "@/lib/collection-fields";
import { normalizeTags } from "@/lib/names";
import { now as clockNow } from "@/server/clock";
import { removeAssetRows } from "@/server/modules/housekeeping";
import { normalizeGenre } from "@/server/modules/publishing/genre";
import { claimReadyAssets } from "@/server/modules/publishing";
import { deleteTrack, lockCollection, normaliseCollection, renameSlug, slugAvailability } from "@/server/modules/publishing/edit";
import { notify, notifyNewRelease } from "@/server/modules/notifications";
import { newSecretToken } from "@/server/modules/tokens";
import { publicTrackWhere } from "@/server/modules/visibility";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });

async function ownedCollection(db: Pick<PrismaClient, "collection">, userId: string, collectionId: string) {
  const collection = await db.collection.findFirst({ where: { id: collectionId, ownerId: userId } });
  if (!collection) throw notFound();
  return collection;
}

export interface CollectionUpdate extends CollectionFields {
  /** Copy genre and tags to the owner's own tracks in the collection (ED-6). */
  applyToTracks?: boolean;
}

/**
 * Edits a collection (PRD 7.6): basic info, type (instant and reversible; release types need a date,
 * ED-11), permalink with redirect, privacy (first public posts the activity), artwork, and the optional
 * "apply to tracks" copy. Only the owner's own tracks are ever touched by `applyToTracks`.
 */
export async function updateCollection(db: PrismaClient, userId: string, collectionId: string, fields: CollectionUpdate) {
  const at = clockNow();
  const result = await db.$transaction(async (tx) => {
    const current = await ownedCollection(tx, userId, collectionId);
    const type = fields.type ?? current.type;
    const releaseDate = fields.releaseDate === undefined ? current.releaseDate : fields.releaseDate;
    const problem = releaseDateProblem(type, releaseDate);
    if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });

    const data: Prisma.CollectionUncheckedUpdateInput = { type, releaseDate: isReleaseType(type) ? releaseDate : releaseDate };
    if (fields.title !== undefined) data.title = fields.title;
    if (fields.description !== undefined) data.description = fields.description?.trim() || null;
    if (fields.genre !== undefined) data.genre = normalizeGenre(fields.genre);
    if (fields.tags !== undefined) data.tags = normalizeTags(fields.tags);
    if (fields.recordLabel !== undefined) data.recordLabel = fields.recordLabel?.trim() || null;
    if (fields.publisher !== undefined) data.publisher = fields.publisher?.trim() || null;
    if (fields.license !== undefined) data.license = fields.license as Prisma.CollectionUncheckedUpdateInput["license"];

    if (fields.privacy) {
      data.visibility = fields.privacy === "public" ? "PUBLIC" : "PRIVATE";
      if (fields.privacy === "public" && !current.publishedAt) {
        data.publishedAt = at;
        await tx.activity.create({ data: { actorId: userId, type: "COLLECTION_POSTED", collectionId, createdAt: at } });
        if (isReleaseType(fields.type ?? current.type)) await notifyNewRelease(tx, { creatorId: userId, collectionId, now: at });
      }
    }
    if (fields.slug && fields.slug !== current.slug) {
      const availability = await slugAvailability(tx, userId, "COLLECTION", fields.slug, collectionId);
      if (!availability.available) {
        throw new TRPCError({ code: availability.reason === "TAKEN" ? "CONFLICT" : "BAD_REQUEST", message: availability.reason === "TAKEN" ? "That permalink is taken" : "That permalink isn't allowed" });
      }
      data.slug = fields.slug;
      await renameSlug(tx, userId, "COLLECTION", collectionId, current.slug, fields.slug);
    }
    let obsoleteArtwork: string | null = null;
    if (fields.artworkAssetId !== undefined && fields.artworkAssetId !== current.artworkAssetId) {
      if (fields.artworkAssetId) await claimReadyAssets(tx, userId, [fields.artworkAssetId], "IMAGE", at);
      data.artworkAssetId = fields.artworkAssetId;
      obsoleteArtwork = current.artworkAssetId;
    }

    const updated = await tx.collection.update({ where: { id: collectionId }, data });

    const own = { creatorId: userId, collectionEntries: { some: { collectionId } } };
    if (fields.applyToTracks && (fields.genre !== undefined || fields.tags !== undefined)) {
      await tx.track.updateMany({
        where: own,
        data: {
          ...(fields.genre !== undefined ? { genre: normalizeGenre(fields.genre) } : {}),
          ...(fields.tags !== undefined ? { tags: normalizeTags(fields.tags) } : {}),
        },
      });
    }
    // ED-8: label and publisher apply to the owner's tracks that have none.
    if (fields.recordLabel) await tx.track.updateMany({ where: { ...own, recordLabel: null }, data: { recordLabel: fields.recordLabel.trim() } });
    if (fields.publisher) await tx.track.updateMany({ where: { ...own, publisher: null }, data: { publisher: fields.publisher.trim() } });
    return { collection: updated, obsoleteArtwork };
  });
  if (result.obsoleteArtwork) await removeArtworkIfUnused(db, result.obsoleteArtwork);
  return result.collection;
}

async function removeArtworkIfUnused(db: PrismaClient, assetId: string) {
  const uses =
    (await db.track.count({ where: { artworkAssetId: assetId } })) +
    (await db.collection.count({ where: { artworkAssetId: assetId } })) +
    (await db.user.count({ where: { OR: [{ avatarAssetId: assetId }, { bannerAssetId: assetId }] } }));
  if (uses > 0) return;
  const claimed = await db.mediaAsset.updateMany({ where: { id: assetId, status: "ATTACHED" }, data: { status: "DELETING" } });
  if (claimed.count === 1) await removeAssetRows(db, [assetId]);
}

export async function resetCollectionSecret(db: PrismaClient, userId: string, collectionId: string) {
  await ownedCollection(db, userId, collectionId);
  const secretToken = newSecretToken();
  await db.collection.update({ where: { id: collectionId }, data: { secretToken } });
  return { secretToken };
}

/**
 * ED-7: appends tracks (new ones go to the bottom). Any of the owner's own tracks, or any public
 * track of someone else; duplicates are ignored; at most 500 per collection. Serialised per collection.
 */
export async function addTracksToCollection(db: PrismaClient, userId: string, collectionId: string, trackIds: string[]) {
  const at = clockNow();
  return db.$transaction(async (tx) => {
    const collection = await ownedCollection(tx, userId, collectionId);
    await lockCollection(tx, collectionId);
    const allowed = await tx.track.findMany({
      where: { id: { in: trackIds }, OR: [{ creatorId: userId, creator: { status: "ACTIVE" } }, publicTrackWhere(at)] },
      select: { id: true },
    });
    const present = new Set((await tx.collectionTrack.findMany({ where: { collectionId }, select: { trackId: true } })).map((t) => t.trackId));
    const fresh = trackIds.filter((id, i) => trackIds.indexOf(id) === i && !present.has(id) && allowed.some((a) => a.id === id));
    if (present.size + fresh.length > MAX_COLLECTION_TRACKS) throw new TRPCError({ code: "BAD_REQUEST", message: "This playlist is full" });
    const last = await tx.collectionTrack.aggregate({ where: { collectionId }, _max: { position: true } });
    let position = (last._max.position ?? -1) + 1;
    for (const trackId of fresh) {
      await tx.collectionTrack.create({ data: { collectionId, trackId, position: position++, addedById: userId, addedAt: at } });
    }
    // NT-1 PLAYLIST_ADD: the creators of tracks added to a public playlist (not their own) hear about it.
    if (collection.type === "PLAYLIST" && collection.visibility === "PUBLIC" && fresh.length) {
      const creators = await tx.track.findMany({ where: { id: { in: fresh } }, select: { id: true, creatorId: true } });
      for (const track of creators) await notify(tx, { recipientId: track.creatorId, actorId: userId, type: "PLAYLIST_ADD", trackId: track.id, collectionId, now: at });
    }
    await normaliseCollection(tx, collectionId);
    return { added: fresh.length };
  });
}

/** Removes a track from the collection (the track itself is kept). */
export async function removeTrackFromCollection(db: PrismaClient, userId: string, collectionId: string, trackId: string) {
  return db.$transaction(async (tx) => {
    await ownedCollection(tx, userId, collectionId);
    await lockCollection(tx, collectionId);
    const removed = await tx.collectionTrack.deleteMany({ where: { collectionId, trackId } });
    await normaliseCollection(tx, collectionId);
    return { removed: removed.count };
  });
}

/** Sets the order of a collection. `trackIds` must be exactly its current tracks (a stale list is refused). */
export async function reorderCollection(db: PrismaClient, userId: string, collectionId: string, trackIds: string[]) {
  return db.$transaction(async (tx) => {
    await ownedCollection(tx, userId, collectionId);
    await lockCollection(tx, collectionId);
    const current = (await tx.collectionTrack.findMany({ where: { collectionId }, select: { trackId: true } })).map((t) => t.trackId);
    const same = current.length === trackIds.length && new Set(trackIds).size === trackIds.length && trackIds.every((id) => current.includes(id));
    if (!same) throw new TRPCError({ code: "CONFLICT", message: "The playlist changed. Reload and try again." });
    // No unique constraint on position, so rewriting one by one cannot collide.
    for (const [position, trackId] of trackIds.entries()) {
      await tx.collectionTrack.update({ where: { collectionId_trackId: { collectionId, trackId } }, data: { position } });
    }
    await normaliseCollection(tx, collectionId);
    return { ok: true };
  });
}

/**
 * ED-10: deletes a collection. With `deleteTracks` the owner's own tracks in it are deleted too (never
 * anyone else's); otherwise they stay as standalone tracks.
 */
export async function deleteCollection(db: PrismaClient, userId: string, collectionId: string, deleteTracks: boolean) {
  const collection = await ownedCollection(db, userId, collectionId);
  if (deleteTracks) {
    const own = await db.collectionTrack.findMany({ where: { collectionId, track: { creatorId: userId } }, select: { trackId: true } });
    for (const { trackId } of own) await deleteTrack(db, userId, trackId);
  }
  await db.collection.delete({ where: { id: collectionId } });
  if (collection.artworkAssetId) await removeArtworkIfUnused(db, collection.artworkAssetId);
  return { ok: true };
}
