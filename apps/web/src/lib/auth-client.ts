import { createAuthClient } from "better-auth/react";

// Same-origin auth avoids leaking server-only environment handling into the browser
// and works for localhost, previews, and production without separate client config.
export const authClient = createAuthClient();
