import { z } from "zod";

import { createTRPCRouter, accountProcedure, protectedProcedure } from "@/server/api/trpc";
import { listBlocked, setBlock } from "@/server/modules/social/blocks";
import { createReport, REPORT_DETAILS_MAX } from "@/server/modules/trust/reports";

export const trustRouter = createTRPCRouter({
  /** TS-1: report a track, collection, comment or user. */
  report: accountProcedure
    .input(z.object({
      targetType: z.enum(["TRACK", "COLLECTION", "COMMENT", "USER"]),
      targetId: z.string().min(1).max(64),
      reason: z.enum(["COPYRIGHT", "SPAM", "HARASSMENT", "HATE", "SEXUAL", "VIOLENCE", "IMPERSONATION", "OTHER"]),
      details: z.string().max(REPORT_DETAILS_MAX).optional(),
      rightsHolder: z.boolean().optional(),
      originalUrl: z.string().max(300).optional(),
    }))
    .mutation(({ input, ctx }) => createReport(ctx.db, { ...input, reporterId: ctx.account.id })),

  setBlock: protectedProcedure
    .input(z.object({ userId: z.string().min(1), blocked: z.boolean() }))
    .mutation(({ input, ctx }) => setBlock(ctx.db, { blockerId: ctx.session.user.id, blockedId: input.userId, blocked: input.blocked })),

  blocked: protectedProcedure.query(({ ctx }) => listBlocked(ctx.db, ctx.session.user.id)),
});
