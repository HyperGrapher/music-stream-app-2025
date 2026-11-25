import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { canAccessTrack } from "@/server/modules/tracks/access";
import { setTrackLike } from "@/server/modules/tracks/likes";

export const engagementRouter = createTRPCRouter({
  /** Like or unlike a track the caller is allowed to see. Safe to repeat. */
  setTrackLike: protectedProcedure
    .input(z.object({ trackId: z.string().uuid(), liked: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const track = await ctx.db.track.findUnique({
        where: { id: input.trackId },
        select: { visibility: true, creatorId: true },
      });
      // Same rule (and same answer) as the stream route: hidden tracks look nonexistent.
      if (!track || !canAccessTrack(track, userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
      }
      return setTrackLike(ctx.db, { userId, trackId: input.trackId, liked: input.liked });
    }),
});
