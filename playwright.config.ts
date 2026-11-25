import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const port = process.env.E2E_PORT ?? "3100";

/**
 * End-to-end tests run against a production build on a FRESH, seeded TEST database:
 *
 *   TEST_DATABASE_URL=postgresql://... pnpm test:e2e
 *
 * tests/e2e/server.mjs wipes that database, migrates, seeds, builds and starts the app.
 * Nothing here ever touches DATABASE_URL.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    // Sandbox conveniences, all unset in CI: a preinstalled Chromium, and a proxy the browser must
    // use to reach the internet (only needed by the opt-in R2 test; localhost is never proxied).
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      proxy: process.env.E2E_BROWSER_PROXY
        ? { server: process.env.E2E_BROWSER_PROXY, bypass: "localhost,127.0.0.1" }
        : undefined,
    },
    ignoreHTTPSErrors: !!process.env.E2E_BROWSER_PROXY,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 15 * 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
