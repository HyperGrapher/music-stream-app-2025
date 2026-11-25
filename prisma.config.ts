import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * CLI configuration (migrate, db push, studio, seed). The app itself connects
 * through the driver adapter in src/server/prisma-client.ts.
 *
 * Neon: DATABASE_URL is the pooled (-pooler) URL used at runtime; migrations
 * need the direct host, so DATABASE_URL_UNPOOLED wins here when it is set.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
