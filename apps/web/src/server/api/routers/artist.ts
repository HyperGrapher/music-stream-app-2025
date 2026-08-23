import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

function artistLookup(value: string) {
  return {
    OR: [{ id: value }, { name: value }],
  };
}

export const artistRouter = createTRPCRouter({
  getArtist: publicProcedure
    .input(z.object({ artist: z.string() }))
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: artistLookup(input.artist),
        select: {
          id: true,
          name: true,
          bio: true,
          image: true,
          bannerUrl: true,
          location: true,
          website: true,
          createdAt: true,
        },
      });

      if (!artist) return null;

      // Get follower count
      const followersCount = await ctx.db.follow.count({
        where: {
          followingId: artist.id,
        },
      });

      // Get following count
      const followingCount = await ctx.db.follow.count({
        where: {
          followerId: artist.id,
        },
      });

      // Get track count
      const trackCount = await ctx.db.track.count({
        where: {
          creatorId: artist.id,
        },
      });

      return {
        ...artist,
        profileImage: artist.bannerUrl,
        followersCount,
        followingCount,
        trackCount,
      };
    }),

  getLatestTracks: publicProcedure
    .input(
      z.object({
        artist: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: artistLookup(input.artist),
        select: {
          id: true,
        },
      });

      if (!artist) return [];

      const tracks = await ctx.db.track.findMany({
        where: {
          creatorId: artist.id,
          visibility: "PUBLIC",
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          title: true,
          description: true,
          waveformData: true,
          duration: true,
          releaseDate: true,
          artworkAsset: { select: { publicUrl: true } },
          playCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          genre: true,
        },
      });

      const streamBaseUrl = (
        process.env.NEXT_PUBLIC_STREAM_API_URL ?? "http://localhost:4000"
      ).replace(/\/+$/, "");

      return tracks.map(({ artworkAsset, ...track }) => ({
        ...track,
        artworkUrl: artworkAsset
          ? (artworkAsset.publicUrl ??
            `${streamBaseUrl}/tracks/${track.id}/artwork`)
          : null,
      }));
    }),

  getPopularTracks: publicProcedure
    .input(
      z.object({
        artist: z.string(),
        limit: z.number().int().min(1).max(100).optional().default(5),
      }),
    )
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: artistLookup(input.artist),
        select: {
          id: true,
        },
      });

      if (!artist) return [];

      const tracks = await ctx.db.track.findMany({
        where: {
          creatorId: artist.id,
          visibility: "PUBLIC",
        },
        orderBy: [
          { playCount: "desc" },
          { likeCount: "desc" },
          { repostCount: "desc" },
          { commentCount: "desc" },
          { createdAt: "desc" },
        ],
        take: input.limit,
        select: {
          id: true,
          title: true,
          description: true,
          artworkAsset: { select: { publicUrl: true } },
          playCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          genre: true,
        },
      });

      const streamBaseUrl = (
        process.env.NEXT_PUBLIC_STREAM_API_URL ?? "http://localhost:4000"
      ).replace(/\/+$/, "");

      return tracks.map(({ artworkAsset, ...track }) => ({
        ...track,
        artworkUrl: artworkAsset
          ? (artworkAsset.publicUrl ??
            `${streamBaseUrl}/tracks/${track.id}/artwork`)
          : null,
      }));
    }),

  getReleases: publicProcedure
    .input(z.object({ artist: z.string() }))
    .query(async ({ input, ctx }) => {
      const creator = await ctx.db.user.findFirst({
        where: artistLookup(input.artist),
        select: { id: true, name: true, image: true },
      });

      if (!creator) return [];

      const releases = await ctx.db.release.findMany({
        where: { creatorId: creator.id, visibility: "PUBLIC" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          type: true,
          description: true,
          releaseDate: true,
          createdAt: true,
          artworkAsset: { select: { publicUrl: true } },
          tracks: {
            orderBy: { position: "asc" },
            select: {
              track: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  duration: true,
                  waveformData: true,
                  genre: true,
                  createdAt: true,
                  playCount: true,
                  likeCount: true,
                  commentCount: true,
                  artworkAsset: { select: { publicUrl: true } },
                },
              },
            },
          },
        },
      });

      const streamBaseUrl = (
        process.env.NEXT_PUBLIC_STREAM_API_URL ?? "http://localhost:4000"
      ).replace(/\/+$/, "");

      return releases.map(({ artworkAsset, tracks, ...release }) => ({
        ...release,
        artworkUrl: artworkAsset?.publicUrl ?? null,
        tracks: tracks.map(({ track }) => {
          const { artworkAsset: trackArtwork, ...trackData } = track;
          return {
            ...trackData,
            userId: creator.id,
            user: { name: creator.name, image: creator.image },
            artworkUrl: trackArtwork
              ? (trackArtwork.publicUrl ??
                `${streamBaseUrl}/tracks/${track.id}/artwork`)
              : null,
          };
        }),
      }));
    }),
});
