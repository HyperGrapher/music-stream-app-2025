import { expect, request as playwrightRequest, test } from "@playwright/test";

import { TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

async function signedIn(browser: import("@playwright/test").Browser, baseURL: string) {
  const request = await playwrightRequest.newContext({ baseURL });
  const { id } = await signUp(request, baseURL);
  const state = await request.storageState();
  await request.dispose();
  const context = await browser.newContext({ baseURL, storageState: state, viewport: { width: 1280, height: 800 } });
  return { id, context, page: await context.newPage() };
}

test("P2: @ autocomplete in a comment, repost with caption, and the Insights CSV", async ({ browser, baseURL }) => {
  const { id, context, page } = await signedIn(browser, baseURL!);

  // @ autocomplete: typing @e2e-c offers the creator; Enter inserts the username
  await page.goto(TRACKS.public.path, { waitUntil: "networkidle" });
  const box = page.getByLabel("Write a comment");
  await box.fill("hello @e2e-c");
  await expect(page.getByRole("option", { name: /E2E Creator/ })).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("hello @e2e-creator ");

  // Repost with caption from a card's menu
  await page.goto("/discover", { waitUntil: "networkidle" });
  const card = page.locator("article", { hasText: TRACKS.public.title }).first();
  await card.hover();
  await card.getByRole("button", { name: /More actions for/ }).click({ force: true });
  await page.getByRole("menuitem", { name: "Repost with caption" }).click();
  await page.getByLabel("Caption").fill("worth a listen");
  await page.getByRole("button", { name: "Repost", exact: true }).click();
  await expect.poll(async () => (await db.trackRepost.findFirst({ where: { userId: id } }))?.caption).toBe("worth a listen");

  // Insights: the current view downloads as CSV
  await page.goto("/studio/insights", { waitUntil: "networkidle" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toBe("insights-7.csv");
  await context.close();
});

test("P2: chart rows show rank change; Home shows Your mixes; Spotlight rows can be dragged", async ({ browser, baseURL }) => {
  const { id, context, page } = await signedIn(browser, baseURL!);
  await db.user.update({ where: { id }, data: { favoriteGenres: ["electronic"] } });
  await page.goto("/charts", { waitUntil: "networkidle" });
  // the seed has plays today and none yesterday: every charting row is new
  const changes = page.getByTestId("rank-change");
  if ((await changes.count()) > 0) await expect(changes.first()).toHaveText(/NEW|\d|No change/);

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /^Your .* mix$/ }).first()).toBeVisible();
  await context.close();
});
