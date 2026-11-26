import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { setCollectionLike, setCollectionRepost, setCommentLike, setTrackRepost } from "@/server/modules/social/engagement";
import { setFollow } from "@/server/modules/social/follow";
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

  /** Follow or unfollow a user. Idempotent; counters change only with real rows. */
  setFollow: protectedProcedure
    .input(z.object({ userId: z.string().min(1), follow: z.boolean() }))
    .mutation(({ input, ctx }) =>
      setFollow(ctx.db, { followerId: ctx.session.user.id, followingId: input.userId, follow: input.follow }),
    ),

  setCollectionLike: protectedProcedure
    .input(z.object({ collectionId: z.string().uuid(), liked: z.boolean(), secret: z.string().max(64).optional() }))
    .mutation(({ input, ctx }) => setCollectionLike(ctx.db, { userId: ctx.session.user.id, ...input })),

  setCommentLike: protectedProcedure
    .input(z.object({ commentId: z.string().uuid(), liked: z.boolean(), access: accessInput }))
    .mutation(({ input, ctx }) => setCommentLike(ctx.db, { userId: ctx.session.user.id, ...input })),

  /** Repost or un-repost a public track (not your own). */
  setTrackRepost: protectedProcedure
    .input(z.object({ trackId: z.string().uuid(), reposted: z.boolean(), caption: z.string().max(140).optional() }))
    .mutation(({ input, ctx }) => setTrackRepost(ctx.db, { userId: ctx.session.user.id, ...input })),

  setCollectionRepost: protectedProcedure
    .input(z.object({ collectionId: z.string().uuid(), reposted: z.boolean(), caption: z.string().max(140).optional(), secret: z.string().max(64).optional() }))
    .mutation(({ input, ctx }) => setCollectionRepost(ctx.db, { userId: ctx.session.user.id, ...input })),
});
