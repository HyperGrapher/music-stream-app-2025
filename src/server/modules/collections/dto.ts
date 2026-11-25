import type { Prisma } from "@/generated/prisma/client";

import { imageAssetSelect, imageUrls } from "@/server/modules/tracks/dto";

export const collectionDtoSelect = {
  id: true,
  slug: true,
  type: true,
  title: true,
  description: true,
  genre: true,
  tags: true,
  visibility: true,
  releaseDate: true,
  publishedAt: true,
  createdAt: true,
  trackCount: true,
  durationMs: true,
  likeCount: true,
  repostCount: true,
  playCount: true,
  ownerId: true,
  owner: { select: { id: true, name: true, username: true, status: true } },
  artworkAsset: imageAssetSelect,
} as const satisfies Prisma.CollectionSelect;

export type CollectionDtoRow = Prisma.CollectionGetPayload<{ select: typeof collectionDtoSelect }>;

export const RELEASE_TYPES = ["ALBUM", "EP", "SINGLE", "COMPILATION"] as const;

export function collectionPermalink(
  collection: { slug: string; owner: { username: string } },
  secret?: string | null,
) {
  const base = `/${collection.owner.username}/sets/${collection.slug}`;
  return secret ? `${base}/s-${secret}` : base;
}

/** Artwork routes of collections go through the generic image route (the artwork has no track id). */
export function toCollectionDto(row: CollectionDtoRow, options: { secret?: string | null } = {}) {
  const { artworkAsset, ...collection } = row;
  return {
    ...collection,
    isPlaylist: collection.type === "PLAYLIST",
    permalink: collectionPermalink(collection, options.secret),
    ...imageUrls(artworkAsset, artworkAsset ? `/api/images/${artworkAsset.id}${options.secret ? `?c=${collection.id}&s=${options.secret}` : ""}` : undefined),
  };
}
