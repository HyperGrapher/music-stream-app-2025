import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { CREATOR_ID, TRACKS } from "./fixtures";
import { createTrackFor, db, signUp } from "./helpers";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
const users: Record<"reposter" | "follower" | "fan", { id: string; state: State }> = {} as never;
let jTrack: Awaited<ReturnType<typeof createTrackFor>>;

test.beforeAll(async ({ playwright, baseURL }) => {
  for (const key of ["reposter", "follower", "fan"] as const) {
    const request = await playwright.request.newContext({ baseURL });
    const { id } = await signUp(request, baseURL!);
    users[key] = { id, state: await request.storageState() };
    await request.dispose();
  }
  jTrack = await createTrackFor(CREATOR_ID, "PUBLIC", "J6 repost me");
  await db.activity.create({ data: { actorId: CREATOR_ID, type: "TRACK_POSTED", trackId: jTrack.id } });
  await db.follow.create({ data: { followerId: users.follower.id, followingId: users.reposter.id } });
});

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

const as = (browser: Browser, baseURL: string, who: keyof typeof users) => browser.newContext({ baseURL, storageState: users[who].state });

test("J6: a listener reposts a track; their follower sees it in the Feed and the creator is notified; un-reposting removes both", async ({ browser, baseURL }) => {
  const reposter = await (await as(browser, baseURL!, "reposter")).newPage();
  await reposter.goto(jTrack.path, { waitUntil: "networkidle" });
  await reposter.getByRole("button", { name: "Repost track", exact: true }).first().click();
  await expect(reposter.getByRole("button", { name: "Undo repost of track" }).first()).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => db.track.findUniqueOrThrow({ where: { id: jTrack.id } }).then((t) => t.repostCount)).toBe(1);
  expect(await db.notification.count({ where: { recipientId: CREATOR_ID, type: "TRACK_REPOST", trackId: jTrack.id } })).toBe(1);

  const followerContext = await as(browser, baseURL!, "follower");
  const feed = await followerContext.newPage();
  await feed.goto("/feed", { waitUntil: "networkidle" });
  const item = feed.getByTestId("feed-item").filter({ hasText: jTrack.title });
  await expect(item).toContainText("reposted");

  await reposter.getByRole("button", { name: "Undo repost of track" }).first().click();
  await expect(reposter.getByRole("button", { name: "Repost track", exact: true }).first()).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => db.notification.count({ where: { recipientId: CREATOR_ID, type: "TRACK_REPOST", trackId: jTrack.id } })).toBe(0);
  await feed.reload({ waitUntil: "networkidle" });
  await expect(feed.getByTestId("feed-item").filter({ hasText: jTrack.title })).toHaveCount(0);
});

test("the bell counts unread notifications and the page lists them grouped; an empty feed asks you to follow creators", async ({ browser, baseURL }) => {
  const emptyFeed = await (await as(browser, baseURL!, "fan")).newPage();
  await emptyFeed.goto("/feed", { waitUntil: "networkidle" });
  await expect(emptyFeed.getByText("Follow creators to fill your feed.")).toBeVisible();

  // two people follow `fan`: one grouped notification, badge 1
  await db.follow.createMany({ data: [{ followerId: users.follower.id, followingId: users.fan.id }, { followerId: users.reposter.id, followingId: users.fan.id }], skipDuplicates: true });
  const day = new Date().toISOString().slice(0, 10);
  for (const actorId of [users.follower.id, users.reposter.id]) {
    await db.notification.create({ data: { recipientId: users.fan.id, actorId, type: "FOLLOW", groupKey: `FOLLOW:${users.fan.id}:${day}` } });
  }
  await emptyFeed.goto("/notifications", { waitUntil: "networkidle" });
  await expect(emptyFeed.getByTestId("notification")).toHaveCount(1);
  await expect(emptyFeed.getByTestId("notification").first()).toContainText("and E2E User started following you");
  await expect(emptyFeed.getByTestId("unread-badge")).toHaveText("1");
  await emptyFeed.getByRole("button", { name: "Mark all as read" }).click();
  await expect(emptyFeed.getByTestId("unread-badge")).toHaveCount(0);
});

test("likes show in the library; history starts empty and the library needs an account", async ({ browser, baseURL }) => {
  const anon = await browser.newPage({ baseURL });
  await anon.goto("/you/likes");
  await expect(anon).toHaveURL(/\/signin/);

  const page = await (await as(browser, baseURL!, "fan")).newPage();
  await page.goto(TRACKS.likes.path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Like track" }).click();
  await expect(page.getByRole("button", { name: "Unlike track" })).toBeVisible();
  // the heart flips optimistically: wait for the server before leaving the page
  await expect.poll(() => db.trackLike.count({ where: { userId: users.fan.id, trackId: TRACKS.likes.id } })).toBe(1);
  await page.goto("/you/likes", { waitUntil: "networkidle" });
  await expect(page.getByText(TRACKS.likes.title).first()).toBeVisible();
  await page.goto("/you/history", { waitUntil: "networkidle" });
  await expect(page.getByText("Tracks you listen to will show up here.")).toBeVisible();
  await page.goto("/you/library", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Recently played" })).toBeVisible();
});
