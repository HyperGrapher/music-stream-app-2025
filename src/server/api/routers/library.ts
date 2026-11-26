import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { clearHistory, libraryCollections, listeningHistory } from "@/server/modules/library";

export const libraryRouter = createTRPCRouter({
  collections: protectedProcedure
    .input(z.object({ kind: z.enum(["playlists", "albums"]), filter: z.enum(["all", "created", "liked"]).default("all"), offset: z.number().int().min(0).max(1000).default(0) }))
    .query(({ input, ctx }) => libraryCollections(ctx.db, ctx.session.user.id, input)),

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(200) }).optional())
    .query(({ input, ctx }) => listeningHistory(ctx.db, ctx.session.user.id, { limit: input?.limit })),

  clearHistory: protectedProcedure.mutation(({ ctx }) => clearHistory(ctx.db, ctx.session.user.id)),
});
