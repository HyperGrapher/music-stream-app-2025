import { accountRouter } from "./routers/account";
import { collectionsRouter } from "./routers/collections";
import { commentsRouter } from "./routers/comments";
import { discoverRouter } from "./routers/discover";
import { engagementRouter } from "./routers/engagement";
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
