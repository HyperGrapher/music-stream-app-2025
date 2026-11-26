import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { now } from "@/server/clock";
import { getEntitlements } from "@/server/modules/plans/entitlements";
import { usedUploadMs } from "@/server/modules/publishing/fields";

export const plansRouter = createTRPCRouter({
  /** The signed-in user's plan, its entitlements and current usage (PRD 2.3). */
  entitlements: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id }, select: { plan: true, planChangedAt: true } });
    return { plan: user.plan, planChangedAt: user.planChangedAt, entitlements: getEntitlements(user), usedUploadMs: await usedUploadMs(ctx.db, ctx.session.user.id) };
  }),

  /**
   * PL-1/PL-2: the demo upgrade (no payment). Switching is immediate and recorded, and downgrading never
   * deletes or hides content (PL-3: limits are enforced where they apply, not by removing anything).
   */
  setPlan: protectedProcedure.input(z.object({ plan: z.enum(["FREE", "PRO"]) })).mutation(async ({ input, ctx }) => {
    const userId = ctx.session.user.id;
    const at = now();
    const current = await ctx.db.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
    if (current.plan === input.plan) return { plan: input.plan };
    await ctx.db.$transaction([
      ctx.db.user.update({ where: { id: userId }, data: { plan: input.plan, planChangedAt: at } }),
      ctx.db.notification.create({
        data: {
          recipientId: userId,
          type: "SYSTEM",
          groupKey: `SYSTEM:${userId}:plan:${at.toISOString()}`,
          message: input.plan === "PRO" ? "You switched to Pro (demo, no payment was taken)." : "You switched back to Free. Nothing was deleted.",
        },
      }),
    ]);
    return { plan: input.plan };
  }),
});
