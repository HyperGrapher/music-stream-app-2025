import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  DISCOVER_SORTS,
  discoverOrderBy,
  discoverWhere,
  toTrackListItem,
  trackListSelect,
} from "@/server/modules/tracks/discover";

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
        where: discoverWhere(input),
        orderBy: discoverOrderBy(input.sort),
        take: input.limit,
        select: trackListSelect,
      });
      return rows.map(toTrackListItem);
    }),

  /** Genres that have at least one public track, most populated first. */
  genres: publicProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.track.groupBy({
      by: ["genre"],
      where: { visibility: "PUBLIC", genre: { not: null } },
      _count: { _all: true },
      orderBy: [{ _count: { genre: "desc" } }, { genre: "asc" }],
    });
    return groups.flatMap((group) =>
      group.genre ? [{ genre: group.genre, count: group._count._all }] : [],
    );
  }),
});
