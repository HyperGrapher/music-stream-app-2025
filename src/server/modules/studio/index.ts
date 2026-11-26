import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeTags } from "@/lib/names";
import type { TrackFields } from "@/lib/track-fields";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { getEntitlements, type Plan } from "@/server/modules/plans/entitlements";
import { deleteTrack, updateTrack } from "@/server/modules/publishing/edit";
import { usedUploadMs } from "@/server/modules/publishing/fields";
import { planRequired } from "@/server/errors";
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

export interface SpotlightPick { kind: "track" | "collection"; id: string }

/**
 * SP-1: your spotlight (ordered) and what you may add: your own public tracks and collections. `limit` is the plan's
 * allowance (PL-3: after a downgrade the extra items are kept but hidden on the profile; `hidden` says how many).
 */
export async function getSpotlight(db: PrismaClient, user: Viewer, now = clockNow()) {
  const limit = getEntitlements(user).spotlightItems;
  const rows = await db.spotlightItem.findMany({
    where: { userId: user.id },
    orderBy: { position: "asc" },
    select: { track: { select: { id: true, title: true } }, collection: { select: { id: true, title: true } } },
  });
  const items = rows.flatMap<{ kind: "track" | "collection"; id: string; title: string }>((r) => (r.track ? [{ kind: "track", id: r.track.id, title: r.track.title }] : r.collection ? [{ kind: "collection", id: r.collection.id, title: r.collection.title }] : []));
  const [tracks, collections] = await Promise.all([
    db.track.findMany({ where: { AND: [{ creatorId: user.id }, visibilityWhere("public", now)] }, orderBy: [{ playCount: "desc" }, { id: "asc" }], take: 100, select: { id: true, title: true } }),
    db.collection.findMany({ where: { ownerId: user.id, visibility: "PUBLIC", moderationState: "VISIBLE" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, title: true } }),
  ]);
  return { limit, items, hidden: Math.max(0, items.length - limit), options: { tracks, collections } };
}

/** Replaces the spotlight with `picks` (own public items only, at most the plan's allowance, no duplicates). */
export async function setSpotlight(db: PrismaClient, user: Viewer, picks: SpotlightPick[], now = clockNow()) {
  const limit = getEntitlements(user).spotlightItems;
  const unique = picks.filter((p, i) => picks.findIndex((q) => q.kind === p.kind && q.id === p.id) === i);
  if (unique.length > limit) {
    if (user.plan === "PRO") throw new TRPCError({ code: "BAD_REQUEST", message: `You can spotlight up to ${limit} items` });
    throw planRequired(`Free accounts can spotlight ${limit} item. Pro allows 5.`);
  }
  const trackIds = unique.filter((p) => p.kind === "track").map((p) => p.id);
  const collectionIds = unique.filter((p) => p.kind === "collection").map((p) => p.id);
  const [tracks, collections] = await Promise.all([
    db.track.count({ where: { AND: [{ id: { in: trackIds } }, { creatorId: user.id }, visibilityWhere("public", now)] } }),
    db.collection.count({ where: { id: { in: collectionIds }, ownerId: user.id, visibility: "PUBLIC", moderationState: "VISIBLE" } }),
  ]);
  if (tracks !== trackIds.length || collections !== collectionIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "You can only spotlight your own public tracks and collections" });
  await db.$transaction(async (tx) => {
    await tx.spotlightItem.deleteMany({ where: { userId: user.id } });
    for (const [position, pick] of unique.entries()) {
      await tx.spotlightItem.create({ data: { userId: user.id, position, ...(pick.kind === "track" ? { trackId: pick.id } : { collectionId: pick.id }) } });
    }
  });
  return { count: unique.length };
}
