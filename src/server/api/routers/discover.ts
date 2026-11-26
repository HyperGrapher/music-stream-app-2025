import { z } from "zod";

import { now } from "@/server/clock";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import {
  DISCOVER_SORTS,
  discoverOrderBy,
  discoverWhere,
} from "@/server/modules/tracks/discover";
import { recommendForUser, trendingTracks, yourMixes } from "@/server/modules/recommendations";
import { byTag } from "@/server/modules/tracks/tags";
import { collectionDtoSelect, RELEASE_TYPES, toCollectionDto } from "@/server/modules/collections/dto";
import { publicCollectionWhere } from "@/server/modules/visibility";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { publicTrackWhere } from "@/server/modules/visibility";

export const discoverRouter = createTRPCRouter({
  /** Public tracks across all creators: newest or most played, optionally by genre / search. */
  tracks: publicProcedure
    .input(
      z.object({
        sort: z.enum(DISCOVER_SORTS).default("latest"),
        genre: z.string().trim().min(1).max(50).optional(),
        q: z.string().trim().max(100).optional(),
        limit: z.number().int().min(1).max(48).default(24),
        offset: z.number().int().min(0).max(5000).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.track.findMany({
        where: discoverWhere(input, now()),
        orderBy: discoverOrderBy(input.sort),
        take: input.limit,
        skip: input.offset,
        select: trackDtoSelect,
      });
      return rows.map((row) => toTrackDto(row, { viewerId: ctx.session?.user.id }));
    }),

  /** Genres that have at least one public track, most populated first. */
  genres: publicProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.track.groupBy({
      by: ["genre"],
      where: { AND: [publicTrackWhere(now()), { genre: { not: null } }] },
      _count: { _all: true },
      orderBy: [{ _count: { genre: "desc" } }, { genre: "asc" }],
    });
    return groups.flatMap((group) =>
      group.genre ? [{ genre: group.genre, count: group._count._all }] : [],
    );
  }),

  /** "More of what you like" (RC-2) for signed-in users; trending for everyone else. */
  /** "Your mixes" (P2): one generated queue per favourite genre. */
  mixes: protectedProcedure.query(({ ctx }) => yourMixes(ctx.db, ctx.session.user.id)),

  forYou: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(12) }).optional())
    .query(({ input, ctx }) => {
      const limit = input?.limit ?? 12;
      return ctx.session ? recommendForUser(ctx.db, ctx.session.user.id, { limit }) : trendingTracks(ctx.db, { limit });
    }),

  /** Trending public tracks of the last `days` days, optionally in one genre. */
  trending: publicProcedure
    .input(z.object({ genre: z.string().trim().max(50).optional(), days: z.number().int().min(1).max(90).default(30), limit: z.number().int().min(1).max(24).default(12) }).optional())
    .query(({ input, ctx }) => trendingTracks(ctx.db, { genres: input?.genre ? [input.genre] : undefined, days: input?.days, limit: input?.limit, viewerId: ctx.session?.user.id ?? null })),

  /** "New from people you follow" (last 30 days): tracks of followed creators, newest first. */
  following: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(12) }).optional())
    .query(async ({ input, ctx }) => {
      const at = now();
      const rows = await ctx.db.track.findMany({
        where: { AND: [publicTrackWhere(at), { publishedAt: { gte: new Date(at.getTime() - 30 * 86_400_000) } }, { creator: { followers: { some: { followerId: ctx.session.user.id } } } }] },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        take: input?.limit ?? 12,
        select: { ...trackDtoSelect, ...likedByMeSelect(ctx.session.user.id) },
      });
      return rows.map((row) => toTrackDto(row, { viewerId: ctx.session.user.id }));
    }),

  /** Latest public albums, EPs, singles and compilations. */
  newReleases: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(12) }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.collection.findMany({
        where: { AND: [publicCollectionWhere(), { type: { in: [...RELEASE_TYPES] } }] },
        orderBy: [{ releaseDate: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
        take: input?.limit ?? 12,
        select: collectionDtoSelect,
      });
      return rows.map((row) => toCollectionDto(row));
    }),

  /** `/tags/[tag]` (GT-2): tracks and collections with the tag or genre. */
  byTag: publicProcedure
    .input(z.object({ tag: z.string().trim().min(1).max(41), sort: z.enum(["popular", "latest"]).default("popular") }))
    .query(({ input, ctx }) => byTag(ctx.db, input.tag, { sort: input.sort, viewerId: ctx.session?.user.id ?? null })),
});
