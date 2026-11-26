import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import { ADDED_WINDOWS, DURATION_BUCKETS, LICENSE_USES, mentionSuggestions, searchCollections, searchPeople, searchTracks, suggest } from "@/server/modules/search";
import { enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";

const q = z.string().trim().min(1).max(100);
const offset = z.number().int().min(0).max(380).default(0);

/** Anonymous callers are limited per client (PRD 14.3); signed-in users are not. */
async function limit(ctx: { db: Parameters<typeof enforceRateLimit>[0]; session: { user: { id: string } } | null; headers: Headers }) {
  if (ctx.session) return;
  const ip = ctx.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  await enforceRateLimit(ctx.db, "search", ip, RATE_LIMITS.searchAnonymousPerMinute);
}

export const searchRouter = createTRPCRouter({
  /** CM-4: usernames for the `@` autocomplete in comments. */
  mentions: protectedProcedure.input(z.object({ q: z.string().max(25) })).query(({ input, ctx }) => mentionSuggestions(ctx.db, ctx.session.user.id, input.q)),

  suggest: publicProcedure.input(z.object({ q: z.string().trim().max(100) })).query(async ({ input, ctx }) => {
    await limit(ctx);
    return suggest(ctx.db, input.q, ctx.session?.user.id ?? null);
  }),

  tracks: publicProcedure
    .input(z.object({
      q, offset,
      genre: z.string().max(50).optional(),
      duration: z.enum(Object.keys(DURATION_BUCKETS) as [keyof typeof DURATION_BUCKETS, ...(keyof typeof DURATION_BUCKETS)[]]).optional(),
      added: z.enum(Object.keys(ADDED_WINDOWS) as [keyof typeof ADDED_WINDOWS, ...(keyof typeof ADDED_WINDOWS)[]]).optional(),
      license: z.enum(Object.keys(LICENSE_USES) as [keyof typeof LICENSE_USES, ...(keyof typeof LICENSE_USES)[]]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await limit(ctx);
      const { q: query, offset: off, ...filters } = input;
      return searchTracks(ctx.db, query, { viewerId: ctx.session?.user.id ?? null, filters, offset: off });
    }),

  people: publicProcedure.input(z.object({ q, offset })).query(async ({ input, ctx }) => {
    await limit(ctx);
    return searchPeople(ctx.db, input.q, { viewerId: ctx.session?.user.id ?? null, offset: input.offset });
  }),

  collections: publicProcedure.input(z.object({ q, kind: z.enum(["albums", "playlists"]), offset })).query(async ({ input, ctx }) => {
    await limit(ctx);
    return searchCollections(ctx.db, input.q, input.kind, { viewerId: ctx.session?.user.id ?? null, offset: input.offset });
  }),
});
