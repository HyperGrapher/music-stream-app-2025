import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { setTrackLike } from "@/server/modules/tracks/likes";

const accessInput = z
  .object({ secret: z.string().max(64).optional(), collectionId: z.string().uuid().optional() })
  .optional();

export const engagementRouter = createTRPCRouter({
  /**
   * Like or unlike a track the caller can see. Safe to repeat. Own and private tracks cannot be
   * liked (VI-2); the rules live in `setTrackLike`.
   */
  setTrackLike: protectedProcedure
    .input(z.object({ trackId: z.string().uuid(), liked: z.boolean(), access: accessInput }))
    .mutation(({ input, ctx }) =>
      setTrackLike(ctx.db, {
        userId: ctx.session.user.id,
        trackId: input.trackId,
        liked: input.liked,
        access: input.access,
      }),
    ),
});
