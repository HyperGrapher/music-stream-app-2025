import { expect, test, type Page } from "@playwright/test";

import { TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

// Headless Chromium hides scrollbars by default, which would hide exactly the bug this file guards against.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

/** Position and size of everything that must not move when an overlay opens: fixed bars and the page content. */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10 } : null;
    };
    const fixedBars = [...document.querySelectorAll("div, nav, aside")].filter((el) => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().width > 300 && !el.closest('[role="dialog"], [data-slot^="dialog"]')).map(box);
    return { main: box(document.querySelector("main")), nav: box(document.querySelector("nav")), fixedBars };
  });

/** Opening a menu or dialog must leave every fixed bar and the content exactly where they were. */
async function expectNoShift(page: Page, open: () => Promise<void>, close: () => Promise<void> = () => page.keyboard.press("Escape")) {
  expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth), "a classic scrollbar takes space").toBeGreaterThan(0);
  const before = await snapshot(page);
  await open();
  await page.waitForTimeout(300);
  expect(await snapshot(page)).toEqual(before);
  await close();
  await page.waitForTimeout(200);
  expect(await snapshot(page)).toEqual(before);
}

test("opening dropdown menus and dialogs does not shift the playback bar or the page", async ({ browser, baseURL, playwright }) => {
  const request = await playwright.request.newContext({ baseURL });
  await signUp(request, baseURL!);
  const context = await browser.newContext({ baseURL, storageState: await request.storageState(), viewport: { width: 1280, height: 600 } });
  await request.dispose();
  const page = await context.newPage();
  await page.goto("/discover", { waitUntil: "networkidle" });

  // put a track in the bar so its own "..." menu exists
  const card = page.locator("article", { hasText: TRACKS.public.title }).first();
  await card.hover();
  await card.getByRole("button", { name: `Play ${TRACKS.public.title}` }).click();
  await expect(page.locator("div.fixed.bottom-0").getByRole("link", { name: TRACKS.public.title })).toBeVisible();

  // navbar user menu
  await expectNoShift(page, () => page.locator("nav").first().getByRole("button").filter({ has: page.locator("img, span.rounded-full") }).last().click());
  // a track card's "..." menu, and the one in the playback bar
  await expectNoShift(page, () => card.getByRole("button", { name: /More actions for/ }).click({ force: true }));
  await expectNoShift(page, () => page.locator("div.fixed.bottom-0").getByRole("button", { name: /More actions for/ }).click());
  // a modal dialog (share) opened from that menu
  await expectNoShift(
    page,
    async () => {
      await card.getByRole("button", { name: /More actions for/ }).click({ force: true });
      await page.getByRole("menuitem", { name: "Share" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  );
  await context.close();
});

test("pages do not shift while they load (cumulative layout shift stays low)", async ({ page }) => {
  for (const path of ["/", "/discover", "/charts", TRACKS.public.path]) {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls, `CLS of ${path}`).toBeLessThan(0.1);
  }
});

test("a page too short to scroll keeps the same width as a long one (scrollbar gutter is reserved)", async ({ page }) => {
  const width = () => page.evaluate(() => ({ nav: Math.round(document.querySelector("nav")!.getBoundingClientRect().width) }));
  await page.goto("/forgot-password", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), "this page must be short for the test to mean anything").toBe(true);
  const short = await width();
  await page.goto("/discover", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
  expect(await width()).toEqual(short);
});
