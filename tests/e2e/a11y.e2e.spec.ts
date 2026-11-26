import AxeBuilder from "@axe-core/playwright";
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";

import { ALBUM, TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

/** WCAG 2.x A and AA rules (PRD 18.4). Anything that fails is listed with its selector so it can be fixed, not silenced. */
async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${label} has accessibility violations`).toEqual([]);
}

const publicPages: [string, string][] = [
  ["home", "/"],
  ["discover", "/discover"],
  ["charts", "/charts"],
  ["search", "/search?q=e2e"],
  ["track page", TRACKS.public.path],
  ["collection page", ALBUM.path],
  ["profile", "/e2e-creator"],
  ["sign in", "/signin"],
  ["sign up", "/signup"],
];

for (const [label, path] of publicPages) {
  test(`accessibility: ${label}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expectAccessible(page, label);
  });
}

test("accessibility: signed-in pages (settings, studio, library, notifications, feed)", async ({ browser, baseURL }) => {
  const request = await playwrightRequest.newContext({ baseURL });
  await signUp(request, baseURL!);
  const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
  await request.dispose();
  const page = await context.newPage();
  for (const path of ["/settings/profile", "/settings/notifications", "/settings/plan", "/studio/tracks", "/studio/insights", "/you/library", "/notifications", "/feed", "/upload"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await expectAccessible(page, path);
  }
  await context.close();
});

test("accessibility: player bar, Next up panel, menus and dialogs", async ({ page }) => {
  await page.goto("/discover", { waitUntil: "networkidle" });
  const card = page.locator("article", { hasText: TRACKS.public.title }).first();
  await card.hover();
  await card.getByRole("button", { name: `Play ${TRACKS.public.title}` }).click();
  await expect(page.locator("div.fixed.bottom-0").getByRole("link", { name: TRACKS.public.title })).toBeVisible();
  await expectAccessible(page, "player bar");

  await page.getByRole("button", { name: "Next up" }).click();
  await expect(page.getByRole("complementary", { name: "Next up" })).toBeVisible();
  await expectAccessible(page, "Next up panel");
  await page.keyboard.press("q");

  await card.getByRole("button", { name: /More actions for/ }).click({ force: true });
  await expectAccessible(page, "track menu");
  await page.getByRole("menuitem", { name: "Share" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectAccessible(page, "share dialog");
});

test("accessibility: phone layout (tab bar, mini player)", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await expectAccessible(page, "home on a phone");
  await page.goto(TRACKS.public.path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Play ${TRACKS.public.title}` }).first().click();
  await expect(page.getByRole("button", { name: "Open player" })).toBeVisible();
  await expectAccessible(page, "track page with the mini player on a phone");
  await page.getByRole("button", { name: "Open player" }).click();
  await expectAccessible(page, "full-screen player sheet");
  await context.close();
});
