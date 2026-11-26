import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { FEED_TABS, listFeed, newFeedCount } from "@/server/modules/feed";

const tab = z.enum(Object.keys(FEED_TABS) as [keyof typeof FEED_TABS, ...(keyof typeof FEED_TABS)[]]);

export const feedRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ tab: tab.default("all"), cursor: z.object({ createdAt: z.date(), id: z.string().uuid() }).optional(), limit: z.number().int().min(1).max(40).default(20) }))
    .query(({ input, ctx }) => listFeed(ctx.db, ctx.session.user.id, input)),

  /** Items newer than `since`, polled every 60 s while the page is visible. */
  newCount: protectedProcedure
    .input(z.object({ since: z.date() }))
    .query(({ input, ctx }) => newFeedCount(ctx.db, ctx.session.user.id, input.since)),
});
