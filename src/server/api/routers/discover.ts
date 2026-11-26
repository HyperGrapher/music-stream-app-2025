import { z } from "zod";

import { now } from "@/server/clock";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  DISCOVER_SORTS,
  discoverOrderBy,
  discoverWhere,
} from "@/server/modules/tracks/discover";
import { recommendForUser, trendingTracks } from "@/server/modules/recommendations";
import { toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
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
      }),
    )
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.track.findMany({
        where: discoverWhere(input, now()),
        orderBy: discoverOrderBy(input.sort),
        take: input.limit,
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
});
