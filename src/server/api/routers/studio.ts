import { z } from "zod";

import { accountProcedure, createTRPCRouter } from "@/server/api/trpc";
import { runAfter } from "@/server/after";
import { r2Client } from "@/lib/r2";
import { drainStorageDeletions } from "@/server/modules/storage/deletion";
import { getSpotlight, setSpotlight, bulkDeleteTracks, bulkUpdateTracks, listStudioCollections, listStudioTracks, MAX_BULK, previewBulk, studioUsage, STUDIO_SORTS, STUDIO_VISIBILITY } from "@/server/modules/studio";

const ids = z.array(z.string().uuid()).min(1).max(MAX_BULK);
const patch = z.object({
  genre: z.string().trim().max(30).nullable().optional(),
  tags: z.object({ mode: z.enum(["add", "remove", "replace"]), values: z.array(z.string().max(30)).max(30) }).optional(),
  privacy: z.enum(["public", "private"]).optional(),
  license: z.string().max(30).optional(),
  downloadable: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  embeddable: z.boolean().optional(),
  statsPublic: z.boolean().optional(),
  recordLabel: z.string().trim().max(100).nullable().optional(),
});

export const studioRouter = createTRPCRouter({
  usage: accountProcedure.query(({ ctx }) => studioUsage(ctx.db, ctx.account)),

  tracks: accountProcedure
    .input(z.object({ q: z.string().max(100).optional(), visibility: z.enum(STUDIO_VISIBILITY).default("all"), sort: z.enum(STUDIO_SORTS).default("createdAt"), dir: z.enum(["asc", "desc"]).default("desc"), offset: z.number().int().min(0).default(0) }))
    .query(({ input, ctx }) => listStudioTracks(ctx.db, ctx.account.id, input)),

  collections: accountProcedure
    .input(z.object({ q: z.string().max(100).optional(), offset: z.number().int().min(0).default(0) }))
    .query(({ input, ctx }) => listStudioCollections(ctx.db, ctx.account.id, input)),

  bulkPreview: accountProcedure.input(z.object({ ids, patch })).query(({ input, ctx }) => previewBulk(ctx.db, ctx.account.id, input.ids, input.patch)),

  bulkUpdate: accountProcedure.input(z.object({ ids, patch })).mutation(({ input, ctx }) => bulkUpdateTracks(ctx.db, ctx.account, input.ids, input.patch)),

  bulkDelete: accountProcedure.input(z.object({ ids, confirmation: z.string().max(20).optional() })).mutation(async ({ input, ctx }) => {
    const result = await bulkDeleteTracks(ctx.db, ctx.account.id, input.ids, input.confirmation);
    runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 100 }));
    return result;
  }),

  spotlight: accountProcedure.query(({ ctx }) => getSpotlight(ctx.db, ctx.account)),

  setSpotlight: accountProcedure
    .input(z.object({ items: z.array(z.object({ kind: z.enum(["track", "collection"]), id: z.string().uuid() })).max(5) }))
    .mutation(({ input, ctx }) => setSpotlight(ctx.db, ctx.account, input.items)),
});
