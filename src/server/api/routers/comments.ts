import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import {
  COMMENT_MAX_LENGTH,
  createComment,
  deleteComment,
  listComments,
} from "@/server/modules/tracks/comments";

/** Proof for hidden tracks: the track's secret link token, or a collection's (with its id). */
const accessInput = z
  .object({ secret: z.string().max(64).optional(), collectionId: z.string().uuid().optional() })
  .optional();

export const commentsRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ trackId: z.string().uuid(), access: accessInput }))
    .query(({ input, ctx }) =>
      listComments(ctx.db, input.trackId, { id: ctx.session?.user.id }, input.access),
    ),

  create: protectedProcedure
    .input(
      z.object({
        trackId: z.string().uuid(),
        content: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
        /** Whole seconds into the track at the moment of posting; omit for a general comment. */
        timestampSeconds: z.number().int().min(0).optional(),
        parentId: z.string().uuid().optional(),
        access: accessInput,
      }),
    )
    .mutation(({ input, ctx }) =>
      createComment(ctx.db, { ...input, authorId: ctx.session.user.id }),
    ),

  delete: protectedProcedure
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      deleteComment(ctx.db, { commentId: input.commentId, userId: ctx.session.user.id }),
    ),
});
