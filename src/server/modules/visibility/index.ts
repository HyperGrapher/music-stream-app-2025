import { timingSafeEqual } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";

/**
 * The single place that decides who may see what (PRD 7.7 and 16.3). Every listing, search, feed
 * and route handler uses these builders; no surface hand-writes visibility conditions.
 */

export type Visibility = "PUBLIC" | "PRIVATE" | "SCHEDULED";
export type EffectiveVisibility = "PUBLIC" | "PRIVATE";

export interface VisibilityEntity {
  visibility: Visibility;
  publishAt?: Date | null;
}

/** SCHEDULED flips to PUBLIC at read time once `publishAt` has passed; no job involved. */
export function effectiveVisibility(entity: VisibilityEntity, now: Date): EffectiveVisibility {
  if (entity.visibility === "PUBLIC") return "PUBLIC";
  if (entity.visibility === "SCHEDULED" && entity.publishAt && entity.publishAt <= now) {
    return "PUBLIC";
  }
  return "PRIVATE";
}

// ---------------------------------------------------------------------------------------------
// Prisma `where` builders
// ---------------------------------------------------------------------------------------------

/** Tracks anyone may discover: effectively public, not removed, owner in good standing. */
export function publicTrackWhere(now: Date): Prisma.TrackWhereInput {
  return {
    moderationState: "VISIBLE",
    creator: { status: "ACTIVE" },
    OR: [{ visibility: "PUBLIC" }, { visibility: "SCHEDULED", publishAt: { lte: now } }],
  };
}

/** Public tracks plus the viewer's own tracks of any visibility (the owner sees removed ones too). */
export function accessibleTrackWhere(
  viewerId: string | null | undefined,
  now: Date,
): Prisma.TrackWhereInput {
  return viewerId
    ? { OR: [publicTrackWhere(now), { creatorId: viewerId }] }
    : publicTrackWhere(now);
}

export function publicCollectionWhere(): Prisma.CollectionWhereInput {
  return { moderationState: "VISIBLE", visibility: "PUBLIC", owner: { status: "ACTIVE" } };
}

export function accessibleCollectionWhere(
  viewerId: string | null | undefined,
): Prisma.CollectionWhereInput {
  return viewerId
    ? { OR: [publicCollectionWhere(), { ownerId: viewerId }] }
    : publicCollectionWhere();
}

// ---------------------------------------------------------------------------------------------
// Access decisions for one loaded row (used by route handlers and tRPC procedures)
// ---------------------------------------------------------------------------------------------

/** The columns `canAccessTrack` needs; select them with `trackAccessSelect`. */
export const trackAccessSelect = {
  id: true,
  creatorId: true,
  visibility: true,
  publishAt: true,
  moderationState: true,
  secretToken: true,
  creator: { select: { status: true } },
} as const satisfies Prisma.TrackSelect;

export interface TrackAccessRow {
  creatorId: string;
  visibility: Visibility;
  publishAt: Date | null;
  moderationState: "VISIBLE" | "REMOVED";
  secretToken: string;
  creator: { status: "ACTIVE" | "SUSPENDED" | "DELETED" };
}

export const collectionAccessSelect = {
  id: true,
  ownerId: true,
  visibility: true,
  moderationState: true,
  secretToken: true,
  owner: { select: { status: true } },
} as const satisfies Prisma.CollectionSelect;

export interface CollectionAccessRow {
  ownerId: string;
  visibility: Visibility;
  moderationState: "VISIBLE" | "REMOVED";
  secretToken: string;
  owner: { status: "ACTIVE" | "SUSPENDED" | "DELETED" };
}

/** Constant-time comparison for secret tokens (SC-4). */
export function tokensMatch(expected: string, provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TrackAccess = "owner" | "public" | "secret";

export interface TrackAccessContext {
  viewerId?: string | null;
  now: Date;
  /** `?s=` of a track secret link. */
  secret?: string | null;
  /** The collection whose secret link was used (`?c=&s=`), already loaded; must belong to the track's owner. */
  viaCollection?: { row: CollectionAccessRow; secret: string | null | undefined } | null;
}

/**
 * Who may play / read a track. Returns how access was granted, or null (callers answer 404, never 403).
 * Owners always get in (even when removed, to see the banner); everyone else needs the content to be
 * visible, not moderated away, owned by an account in good standing, and either effectively public or
 * reached through a valid secret link.
 */
export function trackAccess(track: TrackAccessRow, ctx: TrackAccessContext): TrackAccess | null {
  if (ctx.viewerId && ctx.viewerId === track.creatorId && track.creator.status === "ACTIVE") {
    return "owner";
  }
  if (track.moderationState !== "VISIBLE" || track.creator.status !== "ACTIVE") return null;
  if (effectiveVisibility(track, ctx.now) === "PUBLIC") return "public";
  if (tokensMatch(track.secretToken, ctx.secret)) return "secret";
  const via = ctx.viaCollection;
  if (
    via?.row.ownerId === track.creatorId &&
    via.row.moderationState === "VISIBLE" &&
    via.row.owner.status === "ACTIVE" &&
    tokensMatch(via.row.secretToken, via.secret)
  ) {
    return "secret";
  }
  return null;
}

export function canAccessTrack(track: TrackAccessRow, ctx: TrackAccessContext): boolean {
  return trackAccess(track, ctx) !== null;
}

export function collectionAccess(
  collection: CollectionAccessRow,
  ctx: { viewerId?: string | null; secret?: string | null },
): TrackAccess | null {
  if (ctx.viewerId && ctx.viewerId === collection.ownerId && collection.owner.status === "ACTIVE") {
    return "owner";
  }
  if (collection.moderationState !== "VISIBLE" || collection.owner.status !== "ACTIVE") return null;
  if (collection.visibility === "PUBLIC") return "public";
  return tokensMatch(collection.secretToken, ctx.secret) ? "secret" : null;
}

/** Only fully public content may be cached by shared caches / CDNs. */
export function cacheControlFor(access: TrackAccess, maxAgeSeconds: number) {
  return access === "public"
    ? `public, max-age=${maxAgeSeconds}, immutable`
    : `private, max-age=${Math.min(maxAgeSeconds, 3600)}`;
}
