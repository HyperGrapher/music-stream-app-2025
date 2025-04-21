import { z } from "zod";
import jwt from "jsonwebtoken";

import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";
import { env } from "@/env";

export const streamRouter = createTRPCRouter({
    hello: publicProcedure
        .input(z.object({ text: z.string() }))
        .query(({ input }) => {
            return {
                greeting: `Hello ${input.text}`,
            };
        }),

    create: publicProcedure
        .input(z.object({ name: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {

            if (!ctx.session) {
                console.log('no session');

            }

            console.log('✅ session', ctx.session);


            return ctx.db.post.create({
                data: {
                    name: input.name,
                },
            });
        }),

    getLatest: publicProcedure.query(async ({ ctx }) => {
        const post = await ctx.db.post.findFirst({
            orderBy: { createdAt: "desc" },
        });

        return post ?? null;
    }),

    getPlaybackToken: protectedProcedure
        .input(z.object({ trackId: z.string() }))
        .mutation(({ ctx, input }) => {
            console.log(
                `Generating JWT for track: ${input.trackId}, user: ${ctx.session.user.id}`,
            );

            const payload = {
                userId: ctx.session.user.id,
                trackId: input.trackId,
            };

            const secret = env.JWT_PLAYBACK_SECRET;
            const token = jwt.sign(payload, secret, { expiresIn: "30m" });

            return { token };
        }),
});
