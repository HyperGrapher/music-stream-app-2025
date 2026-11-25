import { artistRouter } from "./routers/artist";
import { discoverRouter } from "./routers/discover";
import { engagementRouter } from "./routers/engagement";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { uploadRouter } from "./routers/upload";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  artist: artistRouter,
  discover: discoverRouter,
  engagement: engagementRouter,
  upload: uploadRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example Create a server-side caller from a request context.
 */
export const createCaller = createCallerFactory(appRouter);
