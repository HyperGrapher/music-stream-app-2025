import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeTags } from "@/lib/names";
import type { TrackFields } from "@/lib/track-fields";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { getEntitlements, type Plan } from "@/server/modules/plans/entitlements";
import { deleteTrack, updateTrack } from "@/server/modules/publishing/edit";
import { usedUploadMs } from "@/server/modules/publishing/fields";
import { effectiveVisibility } from "@/server/modules/visibility";

export const STUDIO_PAGE_SIZE = 50;
export const STUDIO_SORTS = ["createdAt", "title", "durationMs", "playCount", "likeCount", "repostCount", "commentCount", "downloadCount"] as const;
export type StudioSort = (typeof STUDIO_SORTS)[number];
export const STUDIO_VISIBILITY = ["all", "public", "private", "scheduled", "removed"] as const;
export const MAX_BULK = 100;
/** Typed confirmation is required above this many tracks (ST-2). */
export const BULK_DELETE_CONFIRM_ABOVE = 5;

interface Viewer { id: string; plan: Plan }

function visibilityWhere(filter: (typeof STUDIO_VISIBILITY)[number], now: Date): Prisma.TrackWhereInput {
  switch (filter) {
    case "public": return { moderationState: "VISIBLE", OR: [{ visibility: "PUBLIC" }, { visibility: "SCHEDULED", publishAt: { lte: now } }] };
    case "private": return { visibility: "PRIVATE" };
    case "scheduled": return { visibility: "SCHEDULED", publishAt: { gt: now } };
    case "removed": return { moderationState: "REMOVED" };
    default: return {};
  }
}

/** ST-1: the creator's own tracks, any visibility, with stats, collection membership and secret link token. */
export async function listStudioTracks(
  db: PrismaClient,
  userId: string,
  { q, visibility = "all", sort = "createdAt", dir = "desc", offset = 0, limit = STUDIO_PAGE_SIZE, now = clockNow() }: { q?: string; visibility?: (typeof STUDIO_VISIBILITY)[number]; sort?: StudioSort; dir?: "asc" | "desc"; offset?: number; limit?: number; now?: Date },
) {
  const where: Prisma.TrackWhereInput = { AND: [{ creatorId: userId }, visibilityWhere(visibility, now), ...(q?.trim() ? [{ OR: [{ title: { contains: q.trim(), mode: "insensitive" as const } }, { tags: { has: q.trim().toLowerCase() } }] }] : [])] };
  const [rows, total] = await Promise.all([
    db.track.findMany({
      where,
      orderBy: [{ [sort]: dir }, { id: "asc" }],
      skip: offset,
      take: limit,
      select: {
        id: true, slug: true, title: true, visibility: true, publishAt: true, publishedAt: true, createdAt: true, moderationState: true, secretToken: true,
        durationMs: true, playCount: true, likeCount: true, repostCount: true, commentCount: true, downloadCount: true, genre: true, tags: true, license: true, statsPublic: true,
        creator: { select: { username: true } },
        artworkAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        collectionEntries: { select: { collection: { select: { id: true, title: true } } }, take: 3 },
      },
    }),
    db.track.count({ where }),
  ]);
  return {
    total,
    nextOffset: offset + limit < total ? offset + limit : null,
    items: rows.map(({ collectionEntries, artworkAsset, creator, ...row }) => ({
      ...row,
      state: row.moderationState === "REMOVED" ? ("removed" as const) : effectiveVisibility(row, now) === "PUBLIC" ? ("public" as const) : row.visibility === "SCHEDULED" ? ("scheduled" as const) : ("private" as const),
      permalink: `/${creator.username}/${row.slug}`,
      artworkUrl: artworkAsset ? `/api/images/${artworkAsset.id}` : null,
      collections: collectionEntries.map((e) => e.collection),
    })),
  };
}

/** ST-3: used and allowed upload time (null limit = unlimited). */
export async function studioUsage(db: PrismaClient, user: Viewer) {
  const [usedMs, trackCount] = await Promise.all([usedUploadMs(db, user.id), db.track.count({ where: { creatorId: user.id } })]);
  return { usedMs, limitMs: getEntitlements(user).uploadTimeLimitMs, trackCount, plan: user.plan };
}

export interface BulkPatch {
  genre?: string | null;
  /** Tags: add to, remove from, or replace each track's tags. */
  tags?: { mode: "add" | "remove" | "replace"; values: string[] };
  privacy?: "public" | "private";
  license?: string;
  downloadable?: boolean;
  commentsEnabled?: boolean;
  embeddable?: boolean;
  statsPublic?: boolean;
  recordLabel?: string | null;
}

/** Which of the selected tracks a patch would actually change, so the UI can preview "N tracks will change" (ST-2). */
export async function previewBulk(db: PrismaClient, userId: string, ids: string[], patch: BulkPatch) {
  const tracks = await ownedForBulk(db, userId, ids);
  return { selected: tracks.length, changes: tracks.filter((t) => changesTrack(t, patch)).length };
}

type BulkTrack = { id: string; title: string; genre: string | null; tags: string[]; visibility: "PUBLIC" | "PRIVATE" | "SCHEDULED"; license: string; downloadable: boolean; commentsEnabled: boolean; embeddable: boolean; statsPublic: boolean; recordLabel: string | null };

async function ownedForBulk(db: PrismaClient, userId: string, ids: string[]): Promise<BulkTrack[]> {
  if (ids.length === 0 || ids.length > MAX_BULK) throw new TRPCError({ code: "BAD_REQUEST", message: `Select between 1 and ${MAX_BULK} tracks` });
  return db.track.findMany({ where: { id: { in: ids }, creatorId: userId }, select: { id: true, title: true, genre: true, tags: true, visibility: true, license: true, downloadable: true, commentsEnabled: true, embeddable: true, statsPublic: true, recordLabel: true } });
}

function nextTags(current: string[], tags: NonNullable<BulkPatch["tags"]>) {
  const values = normalizeTags(tags.values);
  if (tags.mode === "replace") return values;
  if (tags.mode === "add") return normalizeTags([...current, ...values]);
  return current.filter((t) => !values.includes(t));
}

function fieldsFor(track: BulkTrack, patch: BulkPatch): TrackFields {
  return {
    title: track.title,
    ...(patch.genre !== undefined ? { genre: patch.genre } : {}),
    ...(patch.tags ? { tags: nextTags(track.tags, patch.tags) } : {}),
    ...(patch.privacy ? { privacy: patch.privacy } : {}),
    ...(patch.license ? { license: patch.license } : {}),
    ...(patch.downloadable !== undefined ? { downloadable: patch.downloadable } : {}),
    ...(patch.commentsEnabled !== undefined ? { commentsEnabled: patch.commentsEnabled } : {}),
    ...(patch.embeddable !== undefined ? { embeddable: patch.embeddable } : {}),
    ...(patch.statsPublic !== undefined ? { statsPublic: patch.statsPublic } : {}),
    ...(patch.recordLabel !== undefined ? { recordLabel: patch.recordLabel } : {}),
  };
}

function changesTrack(t: BulkTrack, patch: BulkPatch) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (patch.genre !== undefined && patch.genre !== t.genre) return true;
  if (patch.tags && !same(nextTags(t.tags, patch.tags), t.tags)) return true;
  if (patch.privacy && patch.privacy.toUpperCase() !== t.visibility) return true;
  if (patch.license && patch.license !== t.license) return true;
  if (patch.downloadable !== undefined && patch.downloadable !== t.downloadable) return true;
  if (patch.commentsEnabled !== undefined && patch.commentsEnabled !== t.commentsEnabled) return true;
  if (patch.embeddable !== undefined && patch.embeddable !== t.embeddable) return true;
  if (patch.statsPublic !== undefined && patch.statsPublic !== t.statsPublic) return true;
  if (patch.recordLabel !== undefined && (patch.recordLabel ?? null) !== t.recordLabel) return true;
  return false;
}

/**
 * ST-2 bulk edit. Each track goes through `updateTrack`, so every rule (Quiet Mode is Pro, privacy transitions,
 * activity, counters) applies exactly as in the editor. Tracks run one by one, each atomically; the first
 * failure (e.g. a plan limit) stops the run and the error says how many were already changed.
 */
export async function bulkUpdateTracks(db: PrismaClient, user: Viewer, ids: string[], patch: BulkPatch) {
  const tracks = await ownedForBulk(db, user.id, ids);
  let changed = 0;
  for (const track of tracks.filter((t) => changesTrack(t, patch))) {
    try {
      await updateTrack(db, user, track.id, fieldsFor(track, patch));
    } catch (error) {
      if (changed > 0 && error instanceof TRPCError) throw new TRPCError({ code: error.code, message: `${error.message} (${changed} of the selected tracks were already changed)`, cause: error.cause });
      throw error;
    }
    changed++;
  }
  return { selected: tracks.length, changed };
}

/** Bulk delete. More than 5 tracks need the typed word DELETE (ST-2); deletions run one by one like single deletes. */
export async function bulkDeleteTracks(db: PrismaClient, userId: string, ids: string[], confirmation?: string) {
  const tracks = await ownedForBulk(db, userId, ids);
  if (tracks.length > BULK_DELETE_CONFIRM_ABOVE && confirmation !== "DELETE") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Type DELETE to delete ${tracks.length} tracks` });
  }
  for (const track of tracks) await deleteTrack(db, userId, track.id);
  return { deleted: tracks.length };
}

/** ST: the creator's collections with stats. */
export async function listStudioCollections(db: PrismaClient, userId: string, { q, offset = 0, limit = STUDIO_PAGE_SIZE }: { q?: string; offset?: number; limit?: number }) {
  const where: Prisma.CollectionWhereInput = { ownerId: userId, ...(q?.trim() ? { title: { contains: q.trim(), mode: "insensitive" as const } } : {}) };
  const [rows, total] = await Promise.all([
    db.collection.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: limit, select: { ...collectionDtoSelect, secretToken: true } }),
    db.collection.count({ where }),
  ]);
  return { total, nextOffset: offset + limit < total ? offset + limit : null, items: rows.map(({ secretToken, ...row }) => ({ ...toCollectionDto(row), secretToken })) };
}
