import { env } from "@/env";

import { createPrismaClient } from "./prisma-client";

// node-postgres adapter over the pooled (-pooler) Neon URL: app traffic goes
// through PgBouncer. Migrations use DATABASE_URL_UNPOOLED (see prisma.config.ts).
const makeClient = () =>
  createPrismaClient(env.DATABASE_URL, {
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof makeClient> | undefined;
};

export const db = globalForPrisma.prisma ?? makeClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
