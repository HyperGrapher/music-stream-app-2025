import { expect, test, type BrowserContext } from "@playwright/test";

import { ALBUM, CREATOR, CREATOR_ID, TRACKS } from "./fixtures";
import { createTrackFor, db, signUp } from "./helpers";

const track = TRACKS.public;
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
let userId: string;

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  ({ id: userId } = await signUp(request, baseURL!));
  storageState = await request.storageState();
  await request.dispose();
  // A timed comment at 12 s to seek with (J1).
  await db.comment.deleteMany({ where: { trackId: track.id } });
  await db.comment.create({ data: { trackId: track.id, authorId: CREATOR_ID, content: "listen to this part", timestampSeconds: 12 } });
  await db.track.update({ where: { id: track.id }, data: { commentCount: 1 } });
});

test.afterAll(async () => {
  await db.collection.deleteMany({ where: { ownerId: userId } });
  await db.user.deleteMany({
    where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } },
  });
  await db.$disconnect();
});

test("J1: a visitor plays a track without signing in, follows a timed comment, visits the creator and plays an album", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const card = page.locator("article", { hasText: track.title }).first();
  await card.hover();
  await card.getByRole("button", { name: `Play ${track.title}` }).click();
  const bar = page.locator("div.fixed.bottom-0").filter({ hasText: track.title }).first();
  await expect(bar.getByRole("link", { name: track.title })).toBeVisible();

  // track page, then the timed comment chip under the waveform
  await card.locator(`a[title="${track.title}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${track.path}$`));
  await page.getByRole("button", { name: "E2E Creator commented at 0:12" }).click();
  await expect(page.getByRole("button", { name: `Pause ${track.title}` }).or(page.getByRole("button", { name: `Play ${track.title}` })).first()).toBeVisible();

  // the creator, their Albums tab, then the album's Play button
  await page.getByRole("link", { name: CREATOR.name, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${CREATOR.username}$`));
  await page.getByRole("link", { name: "Albums" }).click();
  await page.locator(`a[href="${ALBUM.path}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${ALBUM.path}$`));
  await page.getByRole("main").getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("div.fixed.bottom-0").getByRole("link", { name: ALBUM.tracks[0].title })).toBeVisible();

  // the album is the queue: its second track is next up
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "Next up" }).getByText(ALBUM.tracks[1].title)).toBeVisible();
});

test("J5: create a playlist from the Add-to-playlist dialog, add tracks of two creators, queue and share", async ({ browser, baseURL }) => {
  const second = await createTrackFor(CREATOR_ID, "PUBLIC", "J5 second track");
  const context = await browser.newContext({ baseURL, storageState });
  const page = await context.newPage();

  await page.goto(track.path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to playlist" }).click();
  await page.getByRole("tab", { name: "Create a playlist" }).click();
  await page.getByLabel("Playlist title").fill("Late-night drive");
  await page.getByRole("button", { name: "Create playlist" }).click();
  await expect(page.getByText("Created “Late-night drive”")).toBeVisible();

  // a second track: the "…" menu offers Add to playlist, then the playlist is ticked off
  await page.goto(second.path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to playlist" }).click();
  await page.getByRole("button", { name: "Add to Late-night drive" }).click();
  await expect(page.getByRole("button", { name: "Remove from Late-night drive" })).toBeVisible();
  await page.keyboard.press("Escape");

  const playlist = await db.collection.findFirstOrThrow({ where: { ownerId: userId, title: "Late-night drive" }, include: { tracks: { orderBy: { position: "asc" } } } });
  expect(playlist.visibility).toBe("PRIVATE");
  expect(playlist.tracks.map((t) => t.trackId)).toEqual([track.id, second.id]);

  // Next up: "Play next" from the menu shows in the panel; the Q shortcut toggles it
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next up" }).click();
  await expect(page.getByRole("complementary", { name: "Next up" })).toBeVisible();
  await page.keyboard.press("q");
  await expect(page.getByRole("complementary", { name: "Next up" })).toBeHidden();

  // share dialog: link, embed tab
  await page.getByRole("button", { name: "Share track" }).click();
  await expect(page.getByLabel("Link", { exact: true })).toHaveValue(new RegExp(`${second.path}$`));
  await page.getByRole("tab", { name: "Embed" }).click();
  await expect(page.getByLabel("Embed code")).toHaveValue(new RegExp(`/embed/track/${second.id}`));
  await context.close();
});

test("embeds render without the app chrome and are frameable; the rest of the app is not", async ({ request }) => {
  const embed = await request.get(`/embed/track/${track.id}`);
  expect(embed.status()).toBe(200);
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
  expect(await embed.text()).not.toContain("Discover");
  const page = await request.get(track.path);
  expect(page.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect((await request.get(`/embed/track/${TRACKS.private.id}`)).status()).toBe(404);
});

test("downloads need an account and the creator's permission", async ({ request, browser, baseURL }) => {
  expect((await request.get(`/api/tracks/${track.id}/download`, { maxRedirects: 0 })).status()).toBe(401);
  const context = await browser.newContext({ baseURL, storageState });
  expect((await context.request.get(`/api/tracks/${track.id}/download`, { maxRedirects: 0 })).status()).toBe(403);
  await db.track.update({ where: { id: track.id }, data: { downloadable: true } });
  const allowed = await context.request.get(`/api/tracks/${track.id}/download`, { maxRedirects: 0 });
  expect(allowed.status()).toBe(307);
  expect(allowed.headers().location).toContain("attachment");
  await expect.poll(async () => (await db.track.findUniqueOrThrow({ where: { id: track.id } })).downloadCount).toBe(1);
  await context.request.get(`/api/tracks/${track.id}/download`, { maxRedirects: 0 });
  expect((await db.track.findUniqueOrThrow({ where: { id: track.id } })).downloadCount).toBe(1); // once per 24 h
  await db.track.update({ where: { id: track.id }, data: { downloadable: false, downloadCount: 0 } });
  await context.close();
});
