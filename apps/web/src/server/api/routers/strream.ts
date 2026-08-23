import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const streamRouter = createTRPCRouter({
  getPlaybackToken: protectedProcedure
    .input(z.object({ trackId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      console.log(
        `🎶 Generating JWT for track: ${input.trackId}, user: ${ctx.session.user.id}`,
      );

      const track = await ctx.db.track.findUnique({
        where: {
          id: input.trackId,
        },
        select: {
          audioAsset: { select: { storageKey: true } },
        },
      });

      if (!track)
        throw new TRPCError({
          message: "Track not found",
          code: "NOT_FOUND",
        });

      const payload = {
        userId: ctx.session.user.id,
        trackId: input.trackId,
        key: track.audioAsset.storageKey,
        timestamp: Date.now(),
      };

      const secret = env.JWT_PLAYBACK_SECRET;
      const token = jwt.sign(payload, secret, { expiresIn: "30m" });

      return { token };
    }),
});
