import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { newAndHotChart, topChart } from "@/server/modules/charts";

const input = z.object({ genre: z.string().trim().max(50).optional(), limit: z.number().int().min(1).max(50).default(50) }).optional();

export const chartsRouter = createTRPCRouter({
  top: publicProcedure.input(input).query(({ input, ctx }) => topChart(ctx.db, { genre: input?.genre, limit: input?.limit, viewerId: ctx.session?.user.id ?? null })),
  newAndHot: publicProcedure.input(input).query(({ input, ctx }) => newAndHotChart(ctx.db, { genre: input?.genre, limit: input?.limit, viewerId: ctx.session?.user.id ?? null })),
});
