import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { CREATOR_ID } from "./fixtures";
import { createTrackFor, db, signUp } from "./helpers";
import { request as playwrightRequest } from "@playwright/test";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

async function person(browser: Browser, baseURL: string, opts: { admin?: boolean } = {}) {
  const request = await playwrightRequest.newContext({ baseURL });
  const { id } = await signUp(request, baseURL);
  if (opts.admin) await db.user.update({ where: { id }, data: { role: "ADMIN" } });
  const state: State = await request.storageState();
  await request.dispose();
  const context = await browser.newContext({ baseURL, storageState: state });
  return { id, context, page: await context.newPage() };
}

test("J9: a listener reports a comment; an admin removes it; the reporter is thanked; the comment is gone for everyone and commentCount is right", async ({ browser, baseURL }) => {
  const author = await person(browser, baseURL!);
  const reporter = await person(browser, baseURL!);
  const admin = await person(browser, baseURL!, { admin: true });
  const track = await createTrackFor(CREATOR_ID, "PUBLIC", "J9 track");
  await db.comment.createMany({ data: [{ trackId: track.id, authorId: author.id, content: "this is abusive", id: crypto.randomUUID() }, { trackId: track.id, authorId: CREATOR_ID, content: "a fine comment" }] });
  await db.track.update({ where: { id: track.id }, data: { commentCount: 2 } });

  // the listener reports it
  await reporter.page.goto(track.path, { waitUntil: "networkidle" });
  const row = reporter.page.getByTestId("comment").filter({ hasText: "this is abusive" });
  await row.getByRole("button", { name: "Report" }).click();
  await reporter.page.getByRole("radio", { name: "Harassment or bullying" }).check();
  await reporter.page.getByLabel("Details").fill("insults other listeners");
  await reporter.page.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.page.getByText("Thanks — we'll review this.")).toBeVisible();

  // the admin finds it in the queue and removes it
  await admin.page.goto("/admin/reports", { waitUntil: "networkidle" });
  await admin.page.getByTestId("report-row").filter({ hasText: "J9 track" }).first().click();
  await expect(admin.page.getByTestId("reported-text")).toHaveText("this is abusive");
  await expect(admin.page.getByRole("dialog")).toContainText("insults other listeners");
  await admin.page.getByLabel("Reason").fill("Harassment");
  await admin.page.getByRole("button", { name: "Remove content" }).click();
  await expect(admin.page.getByText("Removed", { exact: true })).toBeVisible();

  // gone for everyone, counter correct, reporter thanked, audit row written
  await expect.poll(() => db.comment.count({ where: { trackId: track.id } })).toBe(1);
  expect((await db.track.findUniqueOrThrow({ where: { id: track.id } })).commentCount).toBe(1);
  const anonymous = await browser.newPage({ baseURL });
  await anonymous.goto(track.path, { waitUntil: "networkidle" });
  await expect(anonymous.getByText("this is abusive")).toHaveCount(0);
  await expect(anonymous.getByText("a fine comment")).toBeVisible();
  await reporter.page.goto("/notifications", { waitUntil: "networkidle" });
  await expect(reporter.page.getByTestId("notification").first()).toContainText("took action");
  expect(await db.moderationAction.count({ where: { adminId: admin.id, action: "REMOVE_CONTENT" } })).toBe(1);
  await anonymous.close();
  for (const p of [author, reporter, admin]) await p.context.close();
});

test("blocking from a comment hides that person's comments and lists them under Settings > Blocked, where they can be unblocked", async ({ browser, baseURL }) => {
  const creator = await person(browser, baseURL!);
  const pest = await person(browser, baseURL!);
  const track = await createTrackFor(creator.id, "PUBLIC", "Block test");
  await db.comment.create({ data: { trackId: track.id, authorId: pest.id, content: "annoying remark" } });
  await db.track.update({ where: { id: track.id }, data: { commentCount: 1 } });

  creator.page.on("dialog", (dialog) => void dialog.accept());
  await creator.page.goto(track.path, { waitUntil: "networkidle" });
  await creator.page.getByTestId("comment").filter({ hasText: "annoying remark" }).getByRole("button", { name: "Block" }).click();
  await expect(creator.page.getByText("annoying remark")).toHaveCount(0);

  await creator.page.goto("/settings/blocked", { waitUntil: "networkidle" });
  await expect(creator.page.getByTestId("blocked-user")).toHaveCount(1);
  await creator.page.getByRole("button", { name: "Unblock" }).click();
  await expect(creator.page.getByTestId("blocked-user")).toHaveCount(0);
  await creator.page.goto(track.path, { waitUntil: "networkidle" });
  await expect(creator.page.getByText("annoying remark")).toBeVisible();
  await creator.context.close();
  await pest.context.close();
});

test("the admin area does not exist for anyone but admins, and suspended accounts cannot sign in", async ({ browser, baseURL }) => {
  const anon = await browser.newPage({ baseURL });
  expect((await anon.goto("/admin"))?.status()).toBe(404);
  const user = await person(browser, baseURL!);
  expect((await user.page.goto("/admin/reports"))?.status()).toBe(404);
  await expect(user.page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
  const email = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email;
  const fresh = await browser.newPage({ baseURL });
  await fresh.goto("/signin", { waitUntil: "networkidle" });
  await fresh.getByLabel("Email").fill(email);
  await fresh.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await fresh.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(fresh.getByText(/suspended/i)).toBeVisible();
  await anon.close();
  await fresh.close();
  await user.context.close();
});
