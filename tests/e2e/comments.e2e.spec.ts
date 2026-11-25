import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { CREATOR_ID, TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

const track = TRACKS.public; // seeded with a 30 s duration
const trackUrl = `/track/${track.id}`;

let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  await signUp(request, baseURL!);
  storageState = await request.storageState();
  await request.dispose();
  // A timed comment by the creator at 12 s, to click on.
  await db.comment.deleteMany({ where: { trackId: track.id } });
  await db.comment.create({
    data: { trackId: track.id, authorId: CREATOR_ID, content: "the drop is here", timestampSeconds: 12 },
  });
  await db.track.update({ where: { id: track.id }, data: { commentCount: 1 } });
});

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } },
  });
  await db.$disconnect();
});

const signedIn = (browser: Browser, baseURL: string) => browser.newContext({ baseURL, storageState });
const storedComments = () =>
  db.comment.findMany({ where: { trackId: track.id, authorId: { not: CREATOR_ID } }, orderBy: { createdAt: "asc" } });

test("everyone can read comments and see them on the waveform; commenting needs an account", async ({ page }) => {
  await page.goto(trackUrl, { waitUntil: "networkidle" });
  const comments = page.getByTestId("comment");
  await expect(comments).toHaveCount(1);
  await expect(comments.first()).toContainText("the drop is here");
  await expect(comments.first().getByRole("button", { name: "Play from 0:12" })).toBeVisible();
  // marker under the waveform, at the same moment
  await expect(page.getByRole("button", { name: "E2E Creator commented at 0:12" })).toBeVisible();
  await expect(page.getByText("Sign in to join the conversation.")).toBeVisible();
});

test("a general comment is stored without a time when the track is not playing", async ({ browser, baseURL }) => {
  const context = await signedIn(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(trackUrl, { waitUntil: "networkidle" });
  await expect(page.getByText("Play the track to attach a moment to your comment.")).toBeVisible();

  await page.getByRole("textbox", { name: "Write a comment" }).fill("great mix");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByTestId("comment").filter({ hasText: "great mix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 comments" })).toBeVisible();

  const [stored] = await storedComments();
  expect(stored?.content).toBe("great mix");
  expect(stored?.timestampSeconds).toBeNull();
  await context.close();
});

test("a comment posted while listening captures the exact second, and shows on the waveform", async ({ browser, baseURL }) => {
  const context = await signedIn(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(trackUrl, { waitUntil: "networkidle" });

  // Jump the player to 0:12 through the existing comment's time chip.
  await page
    .getByTestId("comment")
    .filter({ hasText: "the drop is here" })
    .getByRole("button", { name: "Play from 0:12" })
    .click();
  await expect(page.getByText("0:12", { exact: true }).first()).toBeVisible();
  const attach = page.getByLabel(/Comment at/);
  await expect(attach).toBeChecked();
  await expect(page.locator("label", { hasText: "Comment at" })).toContainText("0:12");

  await page.getByRole("textbox", { name: "Write a comment" }).fill("same drop, I agree");
  await page.getByRole("button", { name: "Post", exact: true }).click();

  const posted = page.getByTestId("comment").filter({ hasText: "same drop, I agree" });
  await expect(posted.getByRole("button", { name: "Play from 0:12" })).toBeVisible();
  const stored = (await storedComments()).find((c) => c.content === "same drop, I agree");
  expect(stored?.timestampSeconds).toBe(12);
  await expect(page.getByRole("button", { name: /commented at 0:12/ })).toHaveCount(2);
  await context.close();
});

test("the time can be left off, replies thread under their comment, and deleting works", async ({ browser, baseURL }) => {
  const context = await signedIn(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(trackUrl, { waitUntil: "networkidle" });

  // Start the track so a time could be attached, then opt out.
  await page
    .getByTestId("comment")
    .filter({ hasText: "the drop is here" })
    .getByRole("button", { name: "Play from 0:12" })
    .click();
  await page.getByLabel(/Comment at/).uncheck();
  await page.getByRole("textbox", { name: "Write a comment" }).fill("no time on this one");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const untimed = page.getByTestId("comment").filter({ hasText: "no time on this one" });
  await expect(untimed).toBeVisible();
  await expect(untimed.getByRole("button", { name: /Play from/ })).toHaveCount(0);

  // Reply to the creator's comment: nested, and replies carry no time.
  const root = page.getByTestId("comment").filter({ hasText: "the drop is here" });
  await root.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("textbox", { name: "Write a reply" }).fill("thanks for the tip");
  await page.getByRole("button", { name: "Reply", exact: true }).last().click();
  const reply = page.getByTestId("comment").filter({ hasText: "thanks for the tip" });
  await expect(reply).toBeVisible();
  await expect(reply.getByRole("button", { name: /Play from/ })).toHaveCount(0);
  expect((await storedComments()).find((c) => c.content === "thanks for the tip")?.parentId).not.toBeNull();

  // Delete our own reply (with the confirmation), but we cannot delete the creator's comment.
  await expect(root.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => void dialog.accept());
  await reply.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("thanks for the tip")).toHaveCount(0);

  // The counter matches the rows the page shows.
  const total = await db.comment.count({ where: { trackId: track.id } });
  expect((await db.track.findUniqueOrThrow({ where: { id: track.id } })).commentCount).toBe(total);
  await context.close();
});
