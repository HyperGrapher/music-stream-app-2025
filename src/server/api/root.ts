import { accountRouter } from "./routers/account";
import { collectionsRouter } from "./routers/collections";
import { commentsRouter } from "./routers/comments";
import { discoverRouter } from "./routers/discover";
import { engagementRouter } from "./routers/engagement";
import { trustRouter } from "./routers/trust";
import { adminRouter } from "./routers/admin";
import { insightsRouter } from "./routers/insights";
import { studioRouter } from "./routers/studio";
import { chartsRouter } from "./routers/charts";
import { searchRouter } from "./routers/search";
import { libraryRouter } from "./routers/library";
import { feedRouter } from "./routers/feed";
import { messagesRouter } from "./routers/messages";
import { notificationsRouter } from "./routers/notifications";
import { plansRouter } from "./routers/plans";
import { profilesRouter } from "./routers/profiles";
import { tracksRouter } from "./routers/tracks";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { uploadRouter } from "./routers/upload";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  account: accountRouter,
  collections: collectionsRouter,
  comments: commentsRouter,
  discover: discoverRouter,
  engagement: engagementRouter,
  notifications: notificationsRouter,
  messages: messagesRouter,
  feed: feedRouter,
  library: libraryRouter,
  search: searchRouter,
  charts: chartsRouter,
  studio: studioRouter,
  insights: insightsRouter,
  trust: trustRouter,
  admin: adminRouter,
  plans: plansRouter,
  profiles: profilesRouter,
  tracks: tracksRouter,
  upload: uploadRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example Create a server-side caller from a request context.
 */
export const createCaller = createCallerFactory(appRouter);
