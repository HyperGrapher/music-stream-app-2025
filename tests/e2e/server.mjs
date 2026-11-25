// Starts the app for e2e against a FRESH TEST database: wipe -> migrate -> seed -> build -> start.
// Never touches DATABASE_URL / DATABASE_URL_UNPOOLED: both are overridden with TEST_DATABASE_URL
// (prisma.config.ts prefers the unpooled one, which in a dev .env may point at a real database).
import "dotenv/config";
import { execSync, spawn } from "node:child_process";

const test = process.env.TEST_DATABASE_URL;
if (!test) {
  throw new Error("TEST_DATABASE_URL is not set (throwaway Postgres only, never a real database).");
}
if (test === process.env.DATABASE_URL || test === process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: the tests wipe the database.");
}

const port = process.env.E2E_PORT ?? "3100";
const env = {
  ...process.env,
  DATABASE_URL: test,
  DATABASE_URL_UNPOOLED: test,
  BETTER_AUTH_SECRET: "e2e-secret-not-for-production-e2e-secret",
  BETTER_AUTH_URL: `http://localhost:${port}`,
  // Real values are used when present (optional upload test); dummies otherwise. Presigning works
  // with dummy keys, so the stream route still answers with a redirect.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "e2e-google-client-id",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "e2e-google-client-secret",
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID || "e2eaccount",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "e2e-access-key",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "e2e-secret-key",
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "e2e-bucket",
  NEXT_TELEMETRY_DISABLED: "1",
};
const run = (cmd, input) => execSync(cmd, { stdio: ["pipe", "inherit", "inherit"], env, input });

run("pnpm exec prisma db execute --stdin", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
run("pnpm exec prisma migrate deploy");
run("pnpm exec tsx tests/e2e/seed.ts");
run("pnpm build");

const child = spawn("pnpm", ["exec", "next", "start", "-p", port], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
