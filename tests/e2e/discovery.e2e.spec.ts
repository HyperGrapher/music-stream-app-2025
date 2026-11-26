import { expect, test } from "@playwright/test";

import { TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

test.beforeAll(async () => {
  // Seven-day plays for the chart.
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  await db.trackDailyStat.upsert({ where: { trackId_day: { trackId: TRACKS.public.id, day } }, create: { trackId: TRACKS.public.id, day, plays: 5 }, update: { plays: 5 } });
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

test("search finds tracks and people, never private titles, and an empty result still offers something", async ({ page }) => {
  await page.goto("/search?q=plays", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Results for “plays”" })).toBeVisible();
  await expect(page.getByText(TRACKS.plays.title).first()).toBeVisible();

  await page.goto("/search?q=E2E%20Creator&tab=people", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "E2E Creator" }).first()).toBeVisible();

  await page.goto("/search?q=private", { waitUntil: "networkidle" });
  await expect(page.getByText(TRACKS.private.title)).toHaveCount(0);
  await page.goto("/search?q=zzzzqqqq", { waitUntil: "networkidle" });
  await expect(page.getByTestId("no-results")).toBeVisible();
  await expect(page.getByTestId("no-results").locator("article").first()).toBeVisible();

  // #tag searches become tag pages
  await page.goto("/search?q=%23electronic");
  await expect(page).toHaveURL(/\/tags\/electronic$/);
});

test("navbar autocomplete: suggestions with keyboard navigation", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const box = page.getByRole("combobox", { name: "Search tracks and creators" });
  await box.fill("plays");
  const listbox = page.getByRole("listbox");
  await expect(listbox.getByRole("option", { name: /Search for “plays”/ })).toBeVisible();
  await expect(listbox.getByRole("option", { name: new RegExp(TRACKS.plays.title) })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${TRACKS.plays.path}$`));
});

test("charts rank by seven-day plays and offer Play all; tag pages list public tracks", async ({ page }) => {
  await page.goto("/charts", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Charts" })).toBeVisible();
  await expect(page.getByTestId("chart-row").first()).toContainText(TRACKS.public.title);
  await expect(page.getByRole("button", { name: "Play all" })).toBeVisible();
  await page.getByRole("link", { name: "New & Hot" }).click();
  await expect(page).toHaveURL(/kind=hot/);

  await page.goto("/tags/electronic", { waitUntil: "networkidle" });
  await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
  await expect(page.getByText(TRACKS.private.title)).toHaveCount(0);
  await page.goto("/tags/nothing-has-this-tag", { waitUntil: "networkidle" });
  await expect(page.getByText("Nothing is tagged #nothing-has-this-tag yet.")).toBeVisible();
});

test("a signed-in user gets a personalised Home and Discover", async ({ browser, baseURL, playwright }) => {
  const request = await playwright.request.newContext({ baseURL });
  await signUp(request, baseURL!);
  const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
  await request.dispose();
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Trending in Electronic" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "More of what you like" })).toBeVisible();
  await page.goto("/discover", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Made for you" })).toBeVisible();
  await context.close();
});
