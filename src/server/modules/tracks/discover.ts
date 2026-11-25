import type { Prisma } from "@/generated/prisma/client";

import { trackUrls } from "./access";

export const DISCOVER_SORTS = ["latest", "popular"] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];

/** Public tracks only, optionally narrowed by genre and a title / creator-name search. */
export function discoverWhere(filter: {
  genre?: string;
  q?: string;
}): Prisma.TrackWhereInput {
  const q = filter.q?.trim();
  return {
    visibility: "PUBLIC",
    ...(filter.genre ? { genre: filter.genre } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { creator: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

/** Deterministic: ties are broken so paging/refreshing never reshuffles equal tracks. */
export function discoverOrderBy(
  sort: DiscoverSort,
): Prisma.TrackOrderByWithRelationInput[] {
  return sort === "popular"
    ? [
        { playCount: "desc" },
        { likeCount: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ]
    : [{ createdAt: "desc" }, { id: "asc" }];
}

export const trackListSelect = {
  id: true,
  title: true,
  genre: true,
  createdAt: true,
  playCount: true,
  likeCount: true,
  commentCount: true,
  creator: { select: { id: true, name: true, image: true } },
  artworkAsset: { select: { publicUrl: true } },
  audioAsset: {
    select: {
      audioAnalysis: {
        select: { status: true, durationMs: true, waveformVersion: true },
      },
    },
  },
} satisfies Prisma.TrackSelect;

export type TrackListRow = Prisma.TrackGetPayload<{
  select: typeof trackListSelect;
}>;

/** Row -> the PlayerTrack-shaped DTO the player and track cards consume. */
export function toTrackListItem(row: TrackListRow) {
  const { artworkAsset, audioAsset, creator, ...track } = row;
  const analysis = audioAsset.audioAnalysis;
  return {
    ...track,
    userId: creator.id,
    user: { name: creator.name, image: creator.image },
    duration: analysis?.durationMs ? Math.round(analysis.durationMs / 1_000) : 0,
    waveformStatus: analysis?.status ?? ("QUEUED" as const),
    waveformUrl: trackUrls(track.id, analysis?.waveformVersion).waveformUrl,
    artworkUrl: artworkAsset
      ? (artworkAsset.publicUrl ?? trackUrls(track.id).artworkFallbackUrl)
      : null,
  };
}
