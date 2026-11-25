import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Single place that knows how to build a Prisma client. Relative imports only,
 * so tsx scripts (prisma/seed*.ts) can use it without the `@/` alias or the
 * validated app env.
 */
export function createPrismaClient(
  connectionString: string,
  options?: { log?: ("query" | "info" | "warn" | "error")[] },
) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Serverless: fail fast instead of hanging when the pooler is saturated.
      connectionTimeoutMillis: 10_000,
    }),
    log: options?.log,
  });
}
