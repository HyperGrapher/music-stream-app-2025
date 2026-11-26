import { TRPCError } from "@trpc/server";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { firstFree, normalizeTags, slugBase } from "@/lib/names";
import type { CollectionFields } from "@/lib/collection-fields";
import { isReleaseType, MAX_COLLECTION_TRACKS, releaseDateProblem } from "@/lib/collection-fields";
import { type TrackFields } from "@/lib/track-fields";
import { now as clockNow } from "@/server/clock";
import type { Plan } from "@/server/modules/plans/entitlements";
import { newSecretToken } from "@/server/modules/tokens";

import { normalizeGenre } from "./genre";
import { assertUploadQuota, recountPublicTracks, resolveVisibility, trackColumns } from "./fields";

export { normalizeGenre };

type Tx = Prisma.TransactionClient;
export interface Publisher {
  id: string;
  plan: Plan;
}

export type TrackInput = TrackFields & { mediaAssetId: string };
export type CollectionInput = CollectionFields & {
  /** Per-track details: anything left out falls back to the release's genre, tags, license, label and privacy. */
  tracks: (TrackFields & { mediaAssetId: string })[];
  /** "Use for tracks without artwork" (default on). */
  useArtworkForTracks?: boolean;
};

const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message });

/** Retries an operation that failed because a freshly chosen slug was taken concurrently. */
export async function withSlugRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
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
export async function claimReadyAssets(tx: Tx, ownerId: string, assetIds: string[], kind: "AUDIO" | "IMAGE", at: Date) {
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

export async function loadAudio(tx: Tx, ownerId: string, assetIds: string[]) {
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

async function createTrackRow(
  tx: Tx,
  user: Publisher,
  input: TrackInput,
  audio: { mimeType: string; durationMs: number },
  artworkAssetId: string | null,
  at: Date,
  { postActivity = true }: { postActivity?: boolean } = {},
) {
  const wanted = input.slug ?? slugBase(input.title);
  const slug = await firstFree(
    wanted,
    async (candidate) =>
      (await tx.track.findUnique({ where: { creatorId_slug: { creatorId: user.id, slug: candidate } }, select: { id: true } })) !== null,
    80,
  );
  const visibility = resolveVisibility(input, user, at);
  const columns = trackColumns(input, user);
  const track = await tx.track.create({
    data: {
      ...(columns as Prisma.TrackUncheckedCreateInput),
      creatorId: user.id,
      slug,
      title: input.title,
      secretToken: newSecretToken(),
      ...visibility,
      audioAssetId: input.mediaAssetId,
      artworkAssetId,
      durationMs: audio.durationMs,
      mimeType: audio.mimeType,
      // PRD 7.3: the default preview window, unless the creator picked one.
      previewStartMs: input.previewStartMs ?? (audio.durationMs < 60_000 ? 0 : Math.min(Math.floor(audio.durationMs * 0.25), Math.max(0, audio.durationMs - 30_000))),
    },
  });
  if (postActivity && visibility.visibility !== "PRIVATE") {
    // Scheduled tracks enter feeds at their publish time (FD-1).
    const createdAt = visibility.visibility === "SCHEDULED" ? visibility.publishAt! : at;
    await tx.activity.create({ data: { actorId: user.id, type: "TRACK_POSTED", trackId: track.id, createdAt } });
  }
  return track;
}

/** Publishes one uploaded file as a track (claim READY -> ATTACHED, slug, secret link, activity), atomically. */
export async function publishTrack(db: PrismaClient, user: Publisher, input: TrackInput) {
  const at = clockNow();
  return withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const audio = (await loadAudio(tx, user.id, [input.mediaAssetId])).get(input.mediaAssetId)!;
      await assertUploadQuota(tx, user, audio.durationMs);
      await claimReadyAssets(tx, user.id, [input.mediaAssetId], "AUDIO", at);
      if (input.artworkAssetId) await claimReadyAssets(tx, user.id, [input.artworkAssetId], "IMAGE", at);
      const track = await createTrackRow(tx, user, input, audio, input.artworkAssetId ?? null, at);
      await recountPublicTracks(tx, user.id, at);
      return track;
    }),
  );
}

/**
 * Publishes several uploaded files as one collection (PRD 7.4, UP-15): the collection and all its
 * tracks are created in one transaction, with positions 0..n-1. Tracks without their own artwork
 * use the release artwork (unless switched off).
 */
export async function publishCollection(db: PrismaClient, user: Publisher, input: CollectionInput) {
  const ids = input.tracks.map((track) => track.mediaAssetId);
  if (new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Each uploaded file can only appear once in a release" });
  }
  if (input.tracks.length > MAX_COLLECTION_TRACKS) throw new TRPCError({ code: "BAD_REQUEST", message: "A collection holds at most 500 tracks" });
  const type = input.type ?? "ALBUM";
  const at = clockNow();
  const releaseDate = isReleaseType(type) ? (input.releaseDate ?? at) : (input.releaseDate ?? null);
  const dateProblem = releaseDateProblem(type, releaseDate);
  if (dateProblem) throw new TRPCError({ code: "BAD_REQUEST", message: dateProblem });
  const collectionPrivacy = input.privacy ?? "public";

  return withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const audio = await loadAudio(tx, user.id, ids);
      const totalMs = [...audio.values()].reduce((sum, a) => sum + a.durationMs, 0);
      await assertUploadQuota(tx, user, totalMs);
      await claimReadyAssets(tx, user.id, ids, "AUDIO", at);
      const trackArtworkIds = input.tracks.flatMap((t) => (t.artworkAssetId ? [t.artworkAssetId] : []));
      if (input.artworkAssetId) await claimReadyAssets(tx, user.id, [input.artworkAssetId], "IMAGE", at);
      await claimReadyAssets(tx, user.id, trackArtworkIds, "IMAGE", at);

      const slug = await firstFree(
        input.slug ?? slugBase(input.title),
        async (candidate) =>
          (await tx.collection.findUnique({ where: { ownerId_slug: { ownerId: user.id, slug: candidate } }, select: { id: true } })) !== null,
        80,
      );
      const isPublic = collectionPrivacy === "public";
      const collection = await tx.collection.create({
        data: {
          ownerId: user.id,
          slug,
          type,
          title: input.title,
          description: input.description?.trim() || null,
          genre: normalizeGenre(input.genre),
          tags: normalizeTags(input.tags ?? []),
          visibility: isPublic ? "PUBLIC" : "PRIVATE",
          secretToken: newSecretToken(),
          publishedAt: isPublic ? at : null,
          releaseDate,
          recordLabel: input.recordLabel?.trim() || null,
          publisher: input.publisher?.trim() || null,
          license: (input.license as Prisma.CollectionUncheckedCreateInput["license"]) ?? null,
          artworkAssetId: input.artworkAssetId ?? null,
          trackCount: input.tracks.length,
          durationMs: totalMs,
        },
      });

      for (const [position, entry] of input.tracks.entries()) {
        const fallbackArtwork = input.useArtworkForTracks === false ? null : (input.artworkAssetId ?? null);
        const track = await createTrackRow(
          tx,
          user,
          {
            ...entry,
            genre: entry.genre === undefined ? input.genre : entry.genre,
            tags: entry.tags ?? input.tags,
            description: entry.description === undefined ? undefined : entry.description,
            recordLabel: entry.recordLabel === undefined ? input.recordLabel : entry.recordLabel,
            publisher: entry.publisher === undefined ? input.publisher : entry.publisher,
            license: entry.license ?? input.license ?? undefined,
            privacy: entry.privacy ?? collectionPrivacy,
            releaseDate: entry.releaseDate === undefined ? (isReleaseType(type) ? releaseDate : undefined) : entry.releaseDate,
          },
          audio.get(entry.mediaAssetId)!,
          entry.artworkAssetId ?? fallbackArtwork,
          at,
          // A release shows up in feeds once, as the collection, not once per track.
          { postActivity: false },
        );
        await tx.collectionTrack.create({
          data: { collectionId: collection.id, trackId: track.id, position, addedById: user.id, addedAt: at },
        });
      }

      if (isPublic) {
        await tx.activity.create({ data: { actorId: user.id, type: "COLLECTION_POSTED", collectionId: collection.id, createdAt: at } });
      }
      await recountPublicTracks(tx, user.id, at);
      return collection;
    }),
  );
}
