import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const artistRouter = createTRPCRouter({

    getArtist: publicProcedure
        .input(z.object({ artist: z.string() }))
        .query(async ({ input, ctx }) => {
            const artist = await ctx.db.user.findFirst({
                where: {
                    name: input.artist
                },
                orderBy: { createdAt: "desc" },
            });

            return artist ?? null;
        }),

    // TODO
    getLatestTracks: publicProcedure
        .input(z.object({ artist: z.string() }))
        .query(async ({ input, ctx }) => {
            const artist = await ctx.db.user.findFirst({
                where: {
                    name: input.artist
                },
                orderBy: { createdAt: "desc" },
            });

            return artist ?? null;
        }),
});
