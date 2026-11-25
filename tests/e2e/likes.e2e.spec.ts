import { expect, test } from "@playwright/test";

import { TRACKS } from "./fixtures";
import { createTrackFor, db, signUp } from "./helpers";

// A public track reserved for this spec, so other specs' counters and orderings are unaffected.
const trackUrl = TRACKS.likes.path;

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } },
  });
  await db.$disconnect();
});

test("anonymous visitors are asked to sign in and nothing changes", async ({ page }) => {
  await page.goto(trackUrl, { waitUntil: "networkidle" });
  const like = page.getByRole("button", { name: "Like track" });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(page.getByText("Sign in to like tracks")).toBeVisible();
  await expect(like).toHaveAttribute("aria-pressed", "false");
});

test("a signed-in listener can like and unlike, and the state survives a reload", async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  await signUp(request, baseURL!);
  const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
  await request.dispose();
  const page = await context.newPage();

  await page.goto(trackUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Like track" }).click();
  const unlike = page.getByRole("button", { name: "Unlike track" });
  await expect(unlike).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();

  // Rendered by the server from the database, not remembered by the browser.
  await expect.poll(async () => (await db.track.findUniqueOrThrow({ where: { id: TRACKS.likes.id } })).likeCount).toBe(1);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Unlike track" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Unlike track" }).click();
  await expect(page.getByRole("button", { name: "Like track" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await db.track.findUniqueOrThrow({ where: { id: TRACKS.likes.id } })).likeCount).toBe(0);
  await context.close();
});

test("VI-2: on your own track the like button is replaced by the plain counter", async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const user = await signUp(request, baseURL!);
  const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
  await request.dispose();
  const own = await createTrackFor(user.id, "PUBLIC", "My Own Track");
  const page = await context.newPage();
  await page.goto(own.path, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "My Own Track" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Like track/ })).toHaveCount(0);
  await context.close();
});
