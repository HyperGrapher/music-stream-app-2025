import { TRPCError } from "@trpc/server";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { firstFree, normalizeTags, slugBase, slugify } from "@/lib/names";
import { now as clockNow } from "@/server/clock";
import { newSecretToken } from "@/server/modules/tokens";

type Tx = Prisma.TransactionClient;
type CollectionType = "PLAYLIST" | "ALBUM" | "EP" | "SINGLE" | "COMPILATION";

export interface TrackInput {
  mediaAssetId: string;
  title: string;
  artistName?: string | null;
  description?: string | null;
  genre?: string | null;
  tags?: string[];
  privacy: "public" | "private";
  artworkAssetId?: string | null;
}

export interface CollectionInput {
  title: string;
  type: CollectionType;
  description?: string | null;
  genre?: string | null;
  tags?: string[];
  privacy: "public" | "private";
  releaseDate?: Date | null;
  artworkAssetId?: string | null;
  tracks: { mediaAssetId: string; title: string }[];
}

export const normalizeGenre = (genre: string | null | undefined) =>
  genre ? slugify(genre, 30) || null : null;

const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message });

/** Retries an operation that failed because a freshly chosen slug was taken concurrently. */
async function withSlugRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isSlugRace =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        JSON.stringify(error.meta ?? {}).includes("slug");
      if (!isSlugRace || attempt >= attempts) throw error;
    }
  }
}

/** Atomically claims READY assets for the owner (READY -> ATTACHED); fails if any is gone or taken. */
async function claimReadyAssets(
  tx: Tx,
  ownerId: string,
  assetIds: string[],
  kind: "AUDIO" | "IMAGE",
  at: Date,
) {
  if (assetIds.length === 0) return;
  const claimed = await tx.mediaAsset.updateMany({
    where: { id: { in: assetIds }, ownerId, kind, status: "READY" },
    data: { status: "ATTACHED", attachedAt: at, expiresAt: null },
  });
  if (claimed.count !== assetIds.length) {
    throw conflict(
      kind === "AUDIO"
        ? "One or more uploads are already being finalized, canceled or not ready"
        : "Artwork is already being finalized, canceled or not ready",
    );
  }
}

async function loadAudio(tx: Tx, ownerId: string, assetIds: string[]) {
  const assets = await tx.mediaAsset.findMany({
    where: { id: { in: assetIds }, ownerId, kind: "AUDIO" },
    select: { id: true, mimeType: true, audioAnalysis: { select: { status: true, durationMs: true } } },
  });
  if (assets.length !== assetIds.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "One or more completed uploads were not found" });
  }
  return new Map(
    assets.map((asset) => {
      const durationMs = asset.audioAnalysis?.durationMs;
      if (asset.audioAnalysis?.status !== "READY" || !durationMs) {
        // UP-F2: there is no "no waveform" state for new uploads.
        throw new TRPCError({ code: "BAD_REQUEST", message: "This file has not been analysed" });
      }
      return [asset.id, { mimeType: asset.mimeType, durationMs }] as const;
    }),
  );
}

async function ownerPublicTrackCount(tx: Tx, userId: string) {
  const count = await tx.track.count({
    where: { creatorId: userId, OR: [{ visibility: "PUBLIC" }, { visibility: "SCHEDULED", publishAt: { lte: clockNow() } }] },
  });
  await tx.user.update({ where: { id: userId }, data: { publicTrackCount: count } });
}

async function createTrackRow(
  tx: Tx,
  userId: string,
  input: TrackInput,
  audio: { mimeType: string; durationMs: number },
  artworkAssetId: string | null,
  at: Date,
  { postActivity = true }: { postActivity?: boolean } = {},
) {
  const slug = await firstFree(
    slugBase(input.title),
    async (candidate) =>
      (await tx.track.findUnique({
        where: { creatorId_slug: { creatorId: userId, slug: candidate } },
        select: { id: true },
      })) !== null,
    80,
  );
  const isPublic = input.privacy === "public";
  const track = await tx.track.create({
    data: {
      creatorId: userId,
      slug,
      title: input.title,
      artistName: input.artistName?.trim() || null,
      description: input.description?.trim() || null,
      genre: normalizeGenre(input.genre),
      tags: normalizeTags(input.tags ?? []),
      visibility: isPublic ? "PUBLIC" : "PRIVATE",
      secretToken: newSecretToken(),
      publishedAt: isPublic ? at : null,
      audioAssetId: input.mediaAssetId,
      artworkAssetId,
      durationMs: audio.durationMs,
      mimeType: audio.mimeType,
    },
  });
  if (isPublic && postActivity) {
    await tx.activity.create({ data: { actorId: userId, type: "TRACK_POSTED", trackId: track.id, createdAt: at } });
  }
  return track;
}

/** Publishes one uploaded file as a track (claim READY -> ATTACHED, slug, secret link, activity), atomically. */
export async function publishTrack(db: PrismaClient, userId: string, input: TrackInput) {
  const at = clockNow();
  return withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const audio = (await loadAudio(tx, userId, [input.mediaAssetId])).get(input.mediaAssetId)!;
      await claimReadyAssets(tx, userId, [input.mediaAssetId], "AUDIO", at);
      if (input.artworkAssetId) await claimReadyAssets(tx, userId, [input.artworkAssetId], "IMAGE", at);
      const track = await createTrackRow(tx, userId, input, audio, input.artworkAssetId ?? null, at);
      if (track.visibility === "PUBLIC") await ownerPublicTrackCount(tx, userId);
      return track;
    }),
  );
}

/**
 * Publishes several uploaded files as one collection (PRD 7.4, UP-15): the collection and all its
 * tracks are created in one transaction, with positions 0..n-1. Tracks without their own artwork
 * use the release artwork.
 */
export async function publishCollection(db: PrismaClient, userId: string, input: CollectionInput) {
  const ids = input.tracks.map((track) => track.mediaAssetId);
  if (new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Each uploaded file can only appear once in a release" });
  }
  const at = clockNow();
  return withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const audio = await loadAudio(tx, userId, ids);
      await claimReadyAssets(tx, userId, ids, "AUDIO", at);
      if (input.artworkAssetId) await claimReadyAssets(tx, userId, [input.artworkAssetId], "IMAGE", at);

      const slug = await firstFree(
        slugBase(input.title),
        async (candidate) =>
          (await tx.collection.findUnique({
            where: { ownerId_slug: { ownerId: userId, slug: candidate } },
            select: { id: true },
          })) !== null,
        80,
      );
      const isPublic = input.privacy === "public";
      const collection = await tx.collection.create({
        data: {
          ownerId: userId,
          slug,
          type: input.type,
          title: input.title,
          description: input.description?.trim() || null,
          genre: normalizeGenre(input.genre),
          tags: normalizeTags(input.tags ?? []),
          visibility: isPublic ? "PUBLIC" : "PRIVATE",
          secretToken: newSecretToken(),
          publishedAt: isPublic ? at : null,
          releaseDate: input.type === "PLAYLIST" ? (input.releaseDate ?? null) : (input.releaseDate ?? at),
          artworkAssetId: input.artworkAssetId ?? null,
          trackCount: input.tracks.length,
          durationMs: [...audio.values()].reduce((sum, a) => sum + a.durationMs, 0),
        },
      });

      for (const [position, entry] of input.tracks.entries()) {
        const track = await createTrackRow(
          tx,
          userId,
          {
            mediaAssetId: entry.mediaAssetId,
            title: entry.title,
            description: input.description,
            genre: input.genre,
            tags: input.tags,
            privacy: input.privacy,
            artworkAssetId: null,
          },
          audio.get(entry.mediaAssetId)!,
          input.artworkAssetId ?? null,
          at,
          // A release shows up in feeds once, as the collection, not once per track.
          { postActivity: false },
        );
        await tx.collectionTrack.create({
          data: { collectionId: collection.id, trackId: track.id, position, addedById: userId, addedAt: at },
        });
      }

      if (isPublic) {
        await tx.activity.create({
          data: { actorId: userId, type: "COLLECTION_POSTED", collectionId: collection.id, createdAt: at },
        });
        await ownerPublicTrackCount(tx, userId);
      }
      return collection;
    }),
  );
}
