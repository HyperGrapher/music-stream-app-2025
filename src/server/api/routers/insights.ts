import { z } from "zod";

import { accountProcedure, createTRPCRouter } from "@/server/api/trpc";
import { INSIGHT_RANGES, insights } from "@/server/modules/insights";

export const insightsRouter = createTRPCRouter({
  get: accountProcedure
    .input(z.object({ range: z.enum(INSIGHT_RANGES).default("7"), trackId: z.string().uuid().optional() }))
    .query(({ input, ctx }) => insights(ctx.db, ctx.account, input)),

  /** Tracks for the drill-down selector. */
  tracks: accountProcedure.query(({ ctx }) =>
    ctx.db.track.findMany({ where: { creatorId: ctx.account.id }, orderBy: [{ playCount: "desc" }, { id: "asc" }], take: 200, select: { id: true, title: true } })),
});
