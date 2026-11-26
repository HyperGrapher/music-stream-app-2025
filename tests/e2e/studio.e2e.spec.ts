import { expect, request as playwrightRequest, test, type Browser, type BrowserContext } from "@playwright/test";

import { createTrackFor, db, signUp } from "./helpers";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

async function creator(browser: Browser, baseURL: string, plan: "FREE" | "PRO") {
  const request = await playwrightRequest.newContext({ baseURL });
  const { id } = await signUp(request, baseURL);
  await db.user.update({ where: { id }, data: { plan } });
  const state: State = await request.storageState();
  await request.dispose();
  const context = await browser.newContext({ baseURL, storageState: state });
  return { id, context, page: await context.newPage() };
}

const today = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

test("J10: a Pro creator's Insights show plays over time, top tracks, countries and sources consistent with the seeded events", async ({ browser, baseURL }) => {
  const { id, page, context } = await creator(browser, baseURL!, "PRO");
  const hit = await createTrackFor(id, "PUBLIC", "J10 Hit");
  const deep = await createTrackFor(id, "PUBLIC", "J10 Deep cut");
  await db.trackDailyStat.createMany({ data: [{ trackId: hit.id, day: today(), plays: 4, likes: 1 }, { trackId: deep.id, day: today(), plays: 1 }] });
  const event = (trackId: string, countryCode: string | null, source: "HOME" | "SEARCH" | "EMBED", completed = false) => ({ trackId, clientHash: crypto.randomUUID(), countryCode, source, completed });
  await db.playEvent.createMany({ data: [event(hit.id, "TR", "HOME", true), event(hit.id, "TR", "HOME"), event(hit.id, "DE", "SEARCH"), event(hit.id, null, "EMBED"), event(deep.id, "TR", "HOME")] });

  await page.goto("/studio/insights", { waitUntil: "networkidle" });
  await expect(page.getByTestId("tile-Plays")).toContainText("5");
  await expect(page.getByTestId("tile-Likes")).toContainText("1");
  await expect(page.getByRole("img", { name: /Plays per day: 5 in total/ })).toBeVisible();
  const rows = page.getByTestId("top-track");
  await expect(rows.first()).toContainText("J10 Hit");
  await expect(rows.first()).toContainText("4");
  await expect(rows.first()).toContainText("25%"); // 1 of 4 counted events completed

  const countries = page.getByRole("list", { name: "Top countries" });
  await expect(countries.getByRole("listitem").first()).toContainText(/Türkiye|Turkey/);
  await expect(countries.getByRole("listitem").first()).toContainText("3");
  await expect(page.getByRole("list", { name: "Plays by source" }).getByRole("listitem").first()).toContainText("Home");

  // longer ranges and the per-track drill-down work for Pro
  await page.getByRole("button", { name: "30 days" }).click();
  await expect(page.getByTestId("tile-Plays")).toContainText("5");
  await page.getByRole("combobox", { name: "Track", exact: true }).selectOption(deep.id);
  await expect(page.getByTestId("tile-Plays")).toContainText("1");
  await context.close();
});

test("a Free creator sees the 7-day view and upsells instead of Pro ranges and breakdowns", async ({ browser, baseURL }) => {
  const { page, context } = await creator(browser, baseURL!, "FREE");
  await page.goto("/studio/insights", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /30 days/ })).toContainText("PRO");
  await page.getByRole("button", { name: /30 days/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Pro feature");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Top countries PRO" })).toBeVisible();
  await context.close();
});

test("Studio: filter, bulk edit with a preview, quiet mode needs Pro, and bulk delete with typed confirmation", async ({ browser, baseURL }) => {
  const { id, page, context } = await creator(browser, baseURL!, "FREE");
  const tracks = [];
  for (let i = 1; i <= 7; i++) tracks.push(await createTrackFor(id, i === 7 ? "PRIVATE" : "PUBLIC", `Studio ${i}`));

  await page.goto("/studio/tracks", { waitUntil: "networkidle" });
  await expect(page.getByTestId("studio-row")).toHaveCount(7);
  await expect(page.getByTestId("usage-bar")).toContainText("Upgrade to Pro");
  await page.getByRole("button", { name: "Private" }).click();
  await expect(page.getByTestId("studio-row")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByTestId("studio-row")).toHaveCount(7);

  // bulk edit: tags + genre, with a preview of how many change
  await page.getByRole("checkbox", { name: "Select Studio 1" }).check();
  await page.getByRole("checkbox", { name: "Select Studio 2" }).check();
  await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Genre", { exact: true }).selectOption("jazz-blues");
  await expect(page.getByTestId("bulk-preview")).toContainText("2 of 2 will change");
  await page.getByLabel("Show stats publicly").selectOption("off");
  await expect(page.getByRole("dialog").filter({ hasText: "Quiet Mode is a Pro feature" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Updated 2 tracks")).toBeVisible();
  expect((await db.track.findMany({ where: { id: { in: [tracks[0]!.id, tracks[1]!.id] } } })).map((t) => t.genre)).toEqual(["jazz-blues", "jazz-blues"]);

  // bulk delete: more than 5 need the typed word
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();
  await expect.poll(() => db.track.count({ where: { creatorId: id } })).toBe(0);
  await context.close();
});

test("Spotlight: Free pins one item and is offered Pro for more; Pro pins several in order and the profile shows them", async ({ browser, baseURL }) => {
  const { id, page, context } = await creator(browser, baseURL!, "FREE");
  const a = await createTrackFor(id, "PUBLIC", "Spot A");
  await createTrackFor(id, "PUBLIC", "Spot B");
  const username = (await db.user.findUniqueOrThrow({ where: { id } })).username;
  await page.goto("/studio/spotlight", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add Spot A" }).click();
  await page.getByRole("button", { name: "Add Spot B" }).click();
  await expect(page.getByRole("dialog")).toContainText("Pro feature");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save spotlight" }).click();
  await expect(page.getByText("Spotlight saved")).toBeVisible();
  await expect.poll(() => db.spotlightItem.count({ where: { userId: id } })).toBe(1);
  await page.goto(`/${username}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Spot A").first()).toBeVisible();

  await db.user.update({ where: { id }, data: { plan: "PRO" } });
  await page.goto("/studio/spotlight", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add Spot B" }).click();
  await page.getByRole("button", { name: "Move Spot B up" }).click();
  await page.getByRole("button", { name: "Save spotlight" }).click();
  await expect.poll(async () => (await db.spotlightItem.findMany({ where: { userId: id }, orderBy: { position: "asc" } })).map((s) => s.trackId === a.id)).toEqual([false, true]);
  await context.close();
});
