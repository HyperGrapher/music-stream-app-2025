import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure, verifiedProcedure } from "@/server/api/trpc";
import { runAfter } from "@/server/after";
import { sendImmediateEmails } from "@/server/modules/notifications/email";
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

  create: verifiedProcedure
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
    .mutation(async ({ input, ctx }) => {
      const comment = await createComment(ctx.db, { ...input, authorId: ctx.session.user.id });
      // "Immediately" email users (NT-8) hear about it after the response.
      runAfter(async () => {
        const rows = await ctx.db.notification.findMany({ where: { commentId: comment.id }, select: { id: true } });
        await sendImmediateEmails(ctx.db, rows.map((r) => r.id));
      });
      return comment;
    }),

  delete: protectedProcedure
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ input, ctx }) =>
      deleteComment(ctx.db, { commentId: input.commentId, userId: ctx.session.user.id }),
    ),
});
