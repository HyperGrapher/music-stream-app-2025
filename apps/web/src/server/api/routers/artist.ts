import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const artistRouter = createTRPCRouter({
  getArtist: publicProcedure
    .input(z.object({ artist: z.string() }))
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: {
          name: input.artist,
        },
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
      z.object({ artist: z.string(), limit: z.number().optional().default(5) }),
    )
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: {
          name: input.artist,
        },
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

      return tracks.map(({ artworkAsset, ...track }) => ({
        ...track,
        artworkUrl: artworkAsset?.publicUrl ?? null,
      }));
    }),

  getPopularTracks: publicProcedure
    .input(
      z.object({ artist: z.string(), limit: z.number().optional().default(5) }),
    )
    .query(async ({ input, ctx }) => {
      const artist = await ctx.db.user.findFirst({
        where: {
          name: input.artist,
        },
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
        orderBy: { playCount: "desc" },
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

      return tracks.map(({ artworkAsset, ...track }) => ({
        ...track,
        artworkUrl: artworkAsset?.publicUrl ?? null,
      }));
    }),
});
