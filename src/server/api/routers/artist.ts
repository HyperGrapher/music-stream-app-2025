import { z } from "zod";
import { canAccessTrack, trackUrls } from "@/server/modules/tracks/access";
import { likedByMeSelect } from "@/server/modules/tracks/likes";

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
          audioAsset: {
            select: {
              audioAnalysis: {
                select: {
                  status: true,
                  durationMs: true,
                  waveformVersion: true,
                },
              },
            },
          },
          releaseDate: true,
          artworkAsset: { select: { publicUrl: true } },
          ...likedByMeSelect(ctx.session?.user.id),
          playCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          genre: true,
        },
      });

      return tracks.map(({ artworkAsset, audioAsset, likes, ...track }) => {
        const analysis = audioAsset.audioAnalysis;
        return {
          ...track,
          likedByMe: likes.length > 0,
          duration: analysis?.durationMs
            ? Math.round(analysis.durationMs / 1_000)
            : 0,
          waveformStatus: analysis?.status ?? "QUEUED",
          waveformUrl: trackUrls(track.id, analysis?.waveformVersion).waveformUrl,
          artworkUrl: artworkAsset
            ? (artworkAsset.publicUrl ??
              trackUrls(track.id).artworkFallbackUrl)
            : null,
        };
      });
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
          audioAsset: {
            select: {
              audioAnalysis: {
                select: {
                  status: true,
                  durationMs: true,
                  waveformVersion: true,
                },
              },
            },
          },
          artworkAsset: { select: { publicUrl: true } },
          ...likedByMeSelect(ctx.session?.user.id),
          playCount: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
          genre: true,
        },
      });

      return tracks.map(({ artworkAsset, audioAsset, likes, ...track }) => {
        const analysis = audioAsset.audioAnalysis;
        return {
          ...track,
          likedByMe: likes.length > 0,
          duration: analysis?.durationMs
            ? Math.round(analysis.durationMs / 1_000)
            : 0,
          waveformStatus: analysis?.status ?? "QUEUED",
          waveformUrl: trackUrls(track.id, analysis?.waveformVersion).waveformUrl,
          artworkUrl: artworkAsset
            ? (artworkAsset.publicUrl ??
              trackUrls(track.id).artworkFallbackUrl)
            : null,
        };
      });
    }),

  getTrack: publicProcedure
    .input(z.object({ trackId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const track = await ctx.db.track.findFirst({
        where: { id: input.trackId },
        select: {
          id: true,
          creatorId: true,
          visibility: true,
          title: true,
          description: true,
          genre: true,
          tags: true,
          recordLabel: true,
          releaseDate: true,
          createdAt: true,
          playCount: true,
          likeCount: true,
          repostCount: true,
          commentCount: true,
          artworkAsset: { select: { publicUrl: true } },
          ...likedByMeSelect(ctx.session?.user.id),
          audioAsset: {
            select: {
              audioAnalysis: {
                select: {
                  status: true,
                  durationMs: true,
                  waveformVersion: true,
                },
              },
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
              image: true,
              bio: true,
              location: true,
              website: true,
              _count: { select: { followers: true, tracks: true } },
            },
          },
          releaseEntries: {
            orderBy: { position: "asc" },
            take: 1,
            select: {
              position: true,
              release: { select: { id: true, title: true, type: true } },
            },
          },
        },
      });

      // Same rule as the stream route: unlisted works via link, private is owner-only.
      if (!track || !canAccessTrack(track, ctx.session?.user.id)) return null;
      const { artworkAsset, audioAsset, creator, likes, ...trackData } = track;
      const analysis = audioAsset.audioAnalysis;

      return {
        ...trackData,
        likedByMe: likes.length > 0,
        duration: analysis?.durationMs
          ? Math.round(analysis.durationMs / 1_000)
          : 0,
        waveformStatus: analysis?.status ?? "QUEUED",
        waveformUrl: trackUrls(track.id, analysis?.waveformVersion).waveformUrl,
        artworkUrl: artworkAsset
          ? (artworkAsset.publicUrl ??
            trackUrls(track.id).artworkFallbackUrl)
          : null,
        userId: creator.id,
        user: { name: creator.name, image: creator.image },
        creator: {
          id: creator.id,
          name: creator.name,
          image: creator.image,
          bio: creator.bio,
          location: creator.location,
          website: creator.website,
          followersCount: creator._count.followers,
          trackCount: creator._count.tracks,
        },
      };
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
                  audioAsset: {
                    select: {
                      audioAnalysis: {
                        select: {
                          status: true,
                          durationMs: true,
                          waveformVersion: true,
                        },
                      },
                    },
                  },
                  genre: true,
                  createdAt: true,
                  playCount: true,
                  likeCount: true,
                  commentCount: true,
                  artworkAsset: { select: { publicUrl: true } },
                  ...likedByMeSelect(ctx.session?.user.id),
                },
              },
            },
          },
        },
      });

      return releases.map(({ artworkAsset, tracks, ...release }) => ({
        ...release,
        artworkUrl: artworkAsset?.publicUrl ?? null,
        tracks: tracks.map(({ track }) => {
          const {
            artworkAsset: trackArtwork,
            audioAsset,
            likes,
            ...trackData
          } = track;
          const analysis = audioAsset.audioAnalysis;
          return {
            ...trackData,
            likedByMe: likes.length > 0,
            duration: analysis?.durationMs
              ? Math.round(analysis.durationMs / 1_000)
              : 0,
            waveformStatus: analysis?.status ?? "QUEUED",
            waveformUrl: trackUrls(track.id, analysis?.waveformVersion).waveformUrl,
            userId: creator.id,
            user: { name: creator.name, image: creator.image },
            artworkUrl: trackArtwork
              ? (trackArtwork.publicUrl ??
                trackUrls(track.id).artworkFallbackUrl)
              : null,
          };
        }),
      }));
    }),
});
