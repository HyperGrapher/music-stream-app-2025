import { expect, test, type Browser, type Page } from "@playwright/test";

import { db, mockUploadStorage, signUp, sineWav, uniqueEmail } from "./helpers";

/**
 * Upload and editing journeys (PRD J3, J4, J7, J8). Storage is replaced by the database
 * (`mockUploadStorage`); the browser still decodes real audio, and publishing runs for real.
 */
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

async function creator(browser: Browser, baseURL: string, plan: "FREE" | "PRO" = "FREE") {
  const request = (await browser.newContext({ baseURL })).request;
  const user = await signUp(request, baseURL, uniqueEmail("up"));
  if (plan === "PRO") await db.user.update({ where: { id: user.id }, data: { plan } });
  const context = await browser.newContext({ baseURL, storageState: await request.storageState() });
  const page = await context.newPage();
  await mockUploadStorage(page, user.id, baseURL);
  const { username } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { username: true } });
  return { user, username, context, page };
}

const wav = (name: string, seconds = 2, hz = 440) => ({ name, mimeType: "audio/wav", buffer: sineWav(seconds, 8000, hz) });
const choose = (page: Page, ...files: ReturnType<typeof wav>[]) => page.locator("#files").setInputFiles(files);
const allReady = (page: Page, n: number) => expect(page.getByTestId("batch-progress")).toHaveText(new RegExp(`${n} of ${n} ready`), { timeout: 30_000 });

test("J3: upload one file, fill in the details and publish: the track is live", async ({ browser, baseURL }) => {
  const { username, page, context } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await expect(page.getByText("minutes used")).toBeVisible(); // UP-1 usage bar
  await choose(page, wav("01 - Night_Drive.wav"));

  // the editor appears at once, title prefilled from the file name (UP-9), Save locked until ready
  await expect(page.getByLabel("Title")).toHaveValue("Night Drive");
  await allReady(page, 1);
  await page.getByLabel("Title").fill("Night Drive (Demo)");
  await page.getByLabel("Genre", { exact: true }).selectOption("electronic");
  await page.getByLabel("Tags").fill("synth, lo-fi");
  await page.getByLabel("Tags").press("Enter");
  await page.getByRole("tab", { name: "Metadata" }).click();
  await page.getByLabel("BPM").fill("120");
  await page.getByLabel("ISRC").fill("us-abc-24-12345");
  await page.getByRole("tab", { name: "Permissions" }).click();
  await page.getByRole("switch", { name: "Enable downloads" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/${username}/night-drive-demo\\?new=1$`));
  const banner = page.getByTestId("published-banner");
  await expect(banner).toContainText("Your track is live");
  for (const action of ["Copy link", "Edit", "Upload another", "Go to profile"]) await expect(banner.getByRole("button", { name: action }).or(banner.getByRole("link", { name: action }))).toBeVisible();

  const track = await db.track.findFirstOrThrow({ where: { slug: "night-drive-demo", creator: { username } } });
  expect([track.visibility, track.genre, track.tags, track.bpm, track.isrc, track.downloadable, track.durationMs]).toEqual(["PUBLIC", "electronic", ["synth", "lo-fi"], 120, "USABC2412345", true, 2000]);
  expect(track.publishedAt).not.toBeNull();

  // it shows on the profile and in discover for everyone
  const anon = await browser.newContext({ baseURL });
  const visitor = await anon.newPage();
  await visitor.goto(`/${username}/tracks`);
  await expect(visitor.getByText("Night Drive (Demo)").first()).toBeVisible();
  await visitor.goto("/discover?q=night%20drive%20(demo)");
  await expect(visitor.getByText("Night Drive (Demo)").first()).toBeVisible();
  await anon.close();
  await context.close();
});

test("UP-2, UP-5: unsupported files are refused with a reason; a failed file can be retried or removed and never blocks the others", async ({ browser, baseURL }) => {
  const { page, context, user } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await choose(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }, { name: "empty.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(0) });
  await expect(page.getByRole("alert")).toContainText("notes.txt");
  await expect(page.getByRole("alert")).toContainText("Unsupported format");
  await expect(page.getByRole("alert")).toContainText("empty.mp3");

  // a file the browser cannot decode fails with the UP-F2 message; the good one still becomes ready
  await choose(page, { name: "broken.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("this is not audio at all".repeat(50)) }, wav("good.wav"));
  await expect(page.locator('[data-state="failed"]').first()).toContainText("Your browser can't read this file", { timeout: 20_000 });
  await expect(page.locator('[data-state="ready"]').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Remove" }).first().click();
  expect(await db.mediaAsset.count({ where: { ownerId: user.id, status: "ATTACHED" } })).toBe(0);
  await context.close();
});

test("J4: five files become an album: rename, reorder by keyboard, privacy warning, publish, then change the type to EP", async ({ browser, baseURL }) => {
  const { username, page, context } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await choose(page, ...[1, 2, 3, 4, 5].map((n) => wav(`0${n} Track ${n}.wav`, 2, 220 * n)));
  await allReady(page, 5);

  await page.getByLabel("Release title").fill("Five Songs");
  await expect(page.getByRole("radio", { name: "Album" })).toHaveAttribute("aria-checked", "true"); // default for multi-file uploads
  await expect(page.getByText("Album is the default for multi-file uploads")).toBeVisible();

  await page.getByLabel("Title of track 2").fill("Second Song");
  // keyboard reorder (UP-13): lift track 1, move it two places down, drop
  const handle = page.getByRole("button", { name: /Reorder Track 1/ });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Title of track 3")).toHaveValue("Track 1");

  // UP-14: one private track in a public release shows the warning, which "Make all tracks public" clears
  await page.getByRole("checkbox", { name: "Select Track 5" }).check();
  await page.getByLabel("Bulk privacy").selectOption("private");
  await expect(page.getByTestId("privacy-warning")).toContainText("1 track is private");
  await page.getByRole("button", { name: "Make all tracks public" }).click();
  await expect(page.getByTestId("privacy-warning")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select Track 5" }).uncheck();
  await page.getByLabel("Bulk artist").fill("The Quintet");
  await page.getByRole("button", { name: "Set artist" }).click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}/sets/five-songs\\?new=1$`));
  await expect(page.getByTestId("published-banner")).toContainText("Your album is live");
  for (const label of ["View release", "Edit release", "Edit tracks", "Upload more", "Go to profile"]) await expect(page.getByTestId("published-banner").getByRole("link", { name: label }).first()).toBeVisible();

  const set = await db.collection.findFirstOrThrow({ where: { slug: "five-songs", owner: { username } }, include: { tracks: { orderBy: { position: "asc" }, include: { track: true } } } });
  expect(set.type).toBe("ALBUM");
  expect(set.tracks.map((t) => t.track.title)).toEqual(["Track 2".replace("Track 2", "Second Song"), "Track 3", "Track 1", "Track 4", "Track 5"]);
  expect(set.tracks.every((t) => t.track.artistName === "The Quintet" && t.track.visibility === "PUBLIC")).toBe(true);
  expect(set.trackCount).toBe(5);

  // ED-11: change the type to EP, the release moves with it and stays playable
  await page.getByRole("link", { name: "Edit release" }).click();
  await expect(page).toHaveURL(/\/studio\/sets\/.+\/edit/);
  await page.getByRole("radio", { name: "EP" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}/sets/five-songs$`));
  expect((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).type).toBe("EP");
  await page.goto(`/${username}/albums`);
  await expect(page.getByText("Five Songs").first()).toBeVisible();
  await expect(page.getByText("EP ·").first()).toBeVisible();
  await context.close();
});

test("multiple files with the playlist checkbox off become independent tracks saved together (UP-3)", async ({ browser, baseURL }) => {
  const { username, page, context } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await page.getByLabel("Make a playlist when multiple files are selected").uncheck();
  await choose(page, wav("Alpha.wav"), wav("Beta.wav", 2, 330));
  await allReady(page, 2);
  await page.getByRole("button", { name: "Save all" }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}$`), { timeout: 20_000 });
  expect(await db.track.count({ where: { creator: { username }, title: { in: ["Alpha", "Beta"] } } })).toBe(2);
  expect(await db.collection.count({ where: { owner: { username } } })).toBe(0);
  await context.close();
});

test("J7: a private track opens through its secret link only; resetting the link breaks the old one", async ({ browser, baseURL }) => {
  const { username, page, context } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await choose(page, wav("Secret Demo.wav"));
  await allReady(page, 1);
  await page.getByRole("radio", { name: "Private" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\?new=private$/);
  await expect(page.getByTestId("published-banner")).toContainText("private");

  const track = await db.track.findFirstOrThrow({ where: { slug: "secret-demo", creator: { username } } });
  expect(track.visibility).toBe("PRIVATE");
  expect(track.publishedAt).toBeNull();
  const plain = `/${username}/secret-demo`;

  const anon = await browser.newContext({ baseURL });
  const visitor = await anon.newPage();
  expect((await visitor.goto(plain))?.status()).toBe(404);
  expect((await visitor.goto(`${plain}/s-${track.secretToken}`))?.status()).toBe(200);
  await expect(visitor.getByText("Secret Demo").first()).toBeVisible();
  expect((await anon.request.get(`/api/tracks/${track.id}/stream?s=${track.secretToken}`, { maxRedirects: 0 })).status()).toBe(307);

  // reset from the editor
  await page.goto(`/studio/tracks/${track.id}/edit?return=${encodeURIComponent(plain)}`, { waitUntil: "networkidle" });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Reset secret link" }).click();
  await expect.poll(async () => (await db.track.findUniqueOrThrow({ where: { id: track.id } })).secretToken).not.toBe(track.secretToken);
  expect((await visitor.goto(`${plain}/s-${track.secretToken}`))?.status()).toBe(404);
  const fresh = (await db.track.findUniqueOrThrow({ where: { id: track.id } })).secretToken;
  expect((await visitor.goto(`${plain}/s-${fresh}`))?.status()).toBe(200);
  await anon.close();
  await context.close();
});

test("J8: a Pro creator schedules a track; it is invisible until its time, then public (Free users get the upsell)", async ({ browser, baseURL }) => {
  const free = await creator(browser, baseURL!);
  await free.page.goto("/upload", { waitUntil: "networkidle" });
  await choose(free.page, wav("Free Try.wav"));
  await free.page.getByRole("radio", { name: /Schedule/ }).click();
  await expect(free.page.getByRole("dialog")).toContainText("Scheduled releases is a Pro feature");
  await free.context.close();

  const { username, page, context } = await creator(browser, baseURL!, "PRO");
  await page.goto("/upload", { waitUntil: "networkidle" });
  await choose(page, wav("Later Demo.wav"));
  await allReady(page, 1);
  await page.getByRole("radio", { name: /Schedule/ }).click();
  const when = new Date(Date.now() + 2 * 86_400_000);
  const local = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}T10:30`;
  await page.getByLabel("Publish at (your time zone)").fill(local);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\?new=scheduled/);
  await expect(page.getByTestId("published-banner")).toContainText("Scheduled for");

  const track = await db.track.findFirstOrThrow({ where: { slug: "later-demo", creator: { username } } });
  expect(track.visibility).toBe("SCHEDULED");
  const anon = await browser.newContext({ baseURL });
  const visitor = await anon.newPage();
  expect((await visitor.goto(`/${username}/later-demo`))?.status()).toBe(404);
  // the time passes (the e2e server has no injectable clock: move the stored time)
  await db.track.update({ where: { id: track.id }, data: { publishAt: new Date(Date.now() - 60_000) } });
  expect((await visitor.goto(`/${username}/later-demo`))?.status()).toBe(200);
  await visitor.goto(`/${username}/tracks`);
  await expect(visitor.getByText("Later Demo").first()).toBeVisible();
  await anon.close();
  await context.close();
});

test("UP-8: Free upload time is enforced when a file would exceed it", async ({ browser, baseURL }) => {
  const { user, page, context, username } = await creator(browser, baseURL!);
  // almost the whole allowance is used already (178 of 180 minutes)
  const audio = await db.mediaAsset.create({ data: { ownerId: user.id, kind: "AUDIO", status: "ATTACHED", bucket: "e2e-bucket", storageKey: `uploads/${user.id}/${crypto.randomUUID()}-big.mp3`, originalFilename: "big.mp3", mimeType: "audio/mpeg" } });
  await db.audioAnalysis.create({ data: { audioAssetId: audio.id, status: "READY", durationMs: 179 * 60_000 } });
  await db.track.create({ data: { creatorId: user.id, slug: "big-one", audioAssetId: audio.id, title: "Big", publishedAt: new Date(), secretToken: "q".repeat(22), durationMs: 179 * 60_000, mimeType: "audio/mpeg" } });

  await page.goto("/upload", { waitUntil: "networkidle" });
  await expect(page.getByText("179 of 180 minutes used")).toBeVisible();
  await choose(page, wav("Two Minutes.wav", 130));
  await allReady(page, 1);
  await expect(page.getByRole("alert").filter({ hasText: "upload time left" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/upload time left/).first()).toBeVisible();
  expect(await db.track.count({ where: { creatorId: user.id } })).toBe(1);
  void username;
  await context.close();
});

test("editing: change title and permalink (old URL redirects), then delete with the consequences shown (ED-1, ED-4, ED-5)", async ({ browser, baseURL }) => {
  const { user, username, page, context } = await creator(browser, baseURL!);
  await page.goto("/upload", { waitUntil: "networkidle" });
  await choose(page, wav("Original Name.wav"));
  await allReady(page, 1);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}/original-name\\?new=1$`));
  const track = await db.track.findFirstOrThrow({ where: { slug: "original-name", creatorId: user.id } });
  await db.comment.create({ data: { authorId: user.id, trackId: track.id, content: "note to self" } });

  await page.getByTestId("published-banner").getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/studio\/tracks\/.+\/edit\?return=/);
  await page.getByLabel("Title", { exact: true }).fill("Renamed Track");
  await page.getByLabel("Permalink").fill("renamed-track");
  await expect(page.getByText("That permalink is taken")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}/renamed-track$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Renamed Track");
  expect((await page.goto(`/${username}/original-name`))?.url()).toContain("/renamed-track");

  await page.goto(`/studio/tracks/${track.id}/edit?return=/${username}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Delete this track" }).click();
  await expect(page.getByRole("dialog")).toContainText("1 comment");
  await page.getByRole("button", { name: "Delete forever" }).click();
  await expect(page).toHaveURL(new RegExp(`/${username}$`));
  expect(await db.track.count({ where: { id: track.id } })).toBe(0);
  expect((await page.goto(`/${username}/renamed-track`))?.status()).toBe(404);
  await context.close();
});
