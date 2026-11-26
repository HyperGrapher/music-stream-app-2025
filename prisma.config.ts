import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * CLI configuration (migrate, db push, studio, seed). The app itself connects
 * through the driver adapter in src/server/prisma-client.ts.
 *
 * Neon: DATABASE_URL is the pooled (-pooler) URL used at runtime; migrations
 * need the direct host, so DATABASE_URL_UNPOOLED wins here when it is set.
 */
/**
 * Migrations take an advisory lock, which Neon's pooler (PgBouncer, host `...-pooler...`) does not support: the
 * deploy then times out with P1002. Prefer the direct URL, and when only the pooled one exists derive the
 * direct host from it (Neon's direct host is the pooled host without `-pooler`).
 */
function migrationUrl() {
  const direct = process.env.DATABASE_URL_UNPOOLED;
  if (direct) return direct;
  const url = process.env.DATABASE_URL ?? "";
  return url.replace(/(@ep-[^.]*)-pooler\./, "$1.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl(),
  },
});
