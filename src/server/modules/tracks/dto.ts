import type { Prisma } from "@/generated/prisma/client";
import { artworkUrls, type ArtworkUrls } from "@/lib/artwork";
import type { PlayerTrack } from "@/types/player-track";

import { accessQuery, trackUrls, type AccessParams } from "./access";

/** Prisma select for any image asset the UI renders with renditions. */
export const imageAssetSelect = {
  select: { id: true, publicUrl: true, imageWidths: true },
} as const;
/** Artwork asset of a track or collection (same shape; kept for call-site clarity). */
export const artworkAssetSelect = imageAssetSelect;

type ImageAssetRow = { id: string; publicUrl: string | null; imageWidths: number[] };

export function imageUrls(asset: ImageAssetRow | null | undefined, ownerRoute?: string): ArtworkUrls {
  return artworkUrls(asset, ownerRoute ?? (asset ? `/api/images/${asset.id}` : ""));
}

/** Avatar URL for a user: the 160 px rendition of their uploaded avatar, else the OAuth image. */
export function userAvatarUrl(user: { image: string | null; avatarAsset?: ImageAssetRow | null }): string | null {
  const asset = user.avatarAsset;
  if (!asset) return user.image;
  if (asset.imageWidths.length === 0) return asset.publicUrl ?? `/api/images/${asset.id}`;
  const width = asset.imageWidths.find((w) => w >= 160) ?? asset.imageWidths.at(-1)!;
  return asset.publicUrl
    ? asset.publicUrl.replace(/\/\d+\.webp$/, `/${width}.webp`)
    : `/api/images/${asset.id}?w=${width}`;
}

export const creatorSelect = {
  select: {
    id: true,
    name: true,
    username: true,
    image: true,
    verified: true,
    plan: true,
    status: true,
    avatarAsset: imageAssetSelect,
  },
} as const satisfies { select: Prisma.UserSelect };

/** Everything a track card, waveform row or the player needs, in one select. */
export const trackDtoSelect = {
  id: true,
  slug: true,
  title: true,
  artistName: true,
  genre: true,
  tags: true,
  visibility: true,
  explicit: true,
  statsPublic: true,
  durationMs: true,
  publishedAt: true,
  createdAt: true,
  playCount: true,
  likeCount: true,
  repostCount: true,
  commentCount: true,
  creatorId: true,
  creator: creatorSelect,
  artworkAsset: imageAssetSelect,
  audioAsset: {
    select: { mimeType: true, audioAnalysis: { select: { status: true, waveformVersion: true } } },
  },
} as const satisfies Prisma.TrackSelect;

export type TrackDtoRow = Prisma.TrackGetPayload<{ select: typeof trackDtoSelect }>;

/** `/{username}/{slug}`, plus the secret-link suffix when the viewer reached the track that way. */
export function trackPermalink(
  track: { slug: string; creator: { username: string } },
  secret?: string | null,
) {
  const base = `/${track.creator.username}/${track.slug}`;
  return secret ? `${base}/s-${secret}` : base;
}

/**
 * Row -> the `PlayerTrack` shape the UI consumes. `access` carries a secret-link proof so media
 * URLs keep working for hidden tracks. Counters of tracks in Quiet Mode are zeroed for everyone
 * but their owner (TR-3).
 */
export function toTrackDto(
  row: TrackDtoRow & { likes?: { userId: string }[] },
  options: { viewerId?: string | null; access?: AccessParams; secretForPermalink?: string | null } = {},
): PlayerTrack & { likedByMe: boolean; slug: string; permalink: string; creatorId: string } {
  const { artworkAsset, audioAsset, creator, likes, ...track } = row;
  const mimeType = audioAsset.mimeType;
  const analysis = audioAsset.audioAnalysis;
  const urls = trackUrls(track.id, { waveformVersion: analysis?.waveformVersion, access: options.access });
  const hideStats = !track.statsPublic && options.viewerId !== track.creatorId;
  const art = imageUrls(artworkAsset, urls.artworkFallbackUrl);
  return {
    ...track,
    ...(hideStats ? { playCount: 0, likeCount: 0, repostCount: 0, commentCount: 0 } : {}),
    createdAt: track.publishedAt ?? track.createdAt,
    duration: Math.round(track.durationMs / 1000),
    userId: creator.id,
    user: { name: creator.name, username: creator.username, image: userAvatarUrl(creator) },
    mimeType,
    isPrivate: track.visibility !== "PUBLIC",
    permalink: trackPermalink({ slug: track.slug, creator }, options.secretForPermalink),
    streamUrl: urls.streamUrl,
    accessQuery: accessQuery(options.access),
    waveformStatus: analysis?.status ?? "FAILED",
    waveformUrl: analysis?.status === "READY" ? urls.waveformUrl : null,
    likedByMe: (likes?.length ?? 0) > 0,
    ...art,
  };
}

/** Relation select telling, per row, whether the viewer liked it (anonymous viewers match nothing). */
export function likedByMeSelect(viewerId: string | null | undefined) {
  return {
    likes: { where: { userId: viewerId ?? "" }, select: { userId: true }, take: 1 },
  } as const;
}
