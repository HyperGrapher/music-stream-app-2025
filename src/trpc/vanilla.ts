import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

import type { AppRouter } from "@/server/api/root";

/** tRPC client for code that lives outside React (the upload pipeline store). Browser only. */
export const vanillaApi = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ transformer: SuperJSON, url: "/api/trpc" })],
});
