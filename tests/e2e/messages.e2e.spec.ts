import AxeBuilder from "@axe-core/playwright";
import { expect, request as playwrightRequest, test, type Browser } from "@playwright/test";

import { TRACKS } from "./fixtures";
import { db, signUp } from "./helpers";

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.conversation.deleteMany({ where: { members: { none: {} } } });
  await db.$disconnect();
});

async function person(browser: Browser, baseURL: string, viewport = { width: 1280, height: 800 }) {
  const request = await playwrightRequest.newContext({ baseURL });
  const { id } = await signUp(request, baseURL);
  const state = await request.storageState();
  await request.dispose();
  const user = await db.user.findUniqueOrThrow({ where: { id }, select: { username: true } });
  const context = await browser.newContext({ baseURL, storageState: state, viewport });
  return { id, username: user.username, context, page: await context.newPage() };
}

test("J11: message someone, they see the badge and the thread, a track link becomes a card, a message can be reported", async ({ browser, baseURL }) => {
  const ana = await person(browser, baseURL!);
  const bo = await person(browser, baseURL!);

  // Bo takes messages only from people they follow (the default): Ana is told why she cannot write
  await ana.page.goto(`/${bo.username}`, { waitUntil: "networkidle" });
  await ana.page.getByRole("button", { name: "Message" }).click();
  await expect(ana.page.getByText("doesn't accept messages from you")).toBeVisible();
  await expect(ana.page.getByLabel("Message", { exact: true })).toHaveCount(0);

  // Bo opens up in Privacy settings
  await bo.page.goto("/settings/privacy", { waitUntil: "networkidle" });
  await bo.page.getByLabel("Who can message me").selectOption("EVERYONE");
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: bo.id } })).messagePolicy).toBe("EVERYONE");

  // Ana writes the first message: Enter sends, and she lands in the thread
  await ana.page.goto(`/messages?to=${bo.username}`, { waitUntil: "networkidle" });
  await ana.page.getByLabel("Message", { exact: true }).fill("Hey Bo, loved your set");
  await ana.page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(ana.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(ana.page.getByRole("list", { name: /Messages with/ }).getByText("Hey Bo, loved your set")).toBeVisible();
  await expect(ana.page.getByLabel("Message", { exact: true })).toHaveValue("");

  // Bo's navbar shows one unread conversation; the list marks it; opening the thread clears the badge
  await bo.page.goto("/", { waitUntil: "networkidle" });
  await expect(bo.page.getByTestId("message-badge")).toHaveText("1");
  await bo.page.goto("/messages", { waitUntil: "networkidle" });
  const row = bo.page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: /E2E User/ });
  await expect(row).toContainText("Hey Bo, loved your set");
  await row.click();
  await expect(bo.page.getByRole("list", { name: /Messages with/ }).getByText("Hey Bo, loved your set")).toBeVisible();
  await expect(bo.page.getByTestId("message-badge")).toHaveCount(0);

  // Bo answers with a link to a public track: it renders as a card with the title
  const trackUrl = `${baseURL}/e2e-creator/${TRACKS.public.slug}`;
  await bo.page.getByLabel("Message", { exact: true }).fill(`Thanks! Try this: ${trackUrl}`);
  await bo.page.getByRole("button", { name: "Send message" }).click();
  await expect(bo.page.getByRole("button", { name: `Play ${TRACKS.public.title}` })).toBeVisible();

  // Ana sees it after the next poll (reload stands in for the 10 s timer) and reports it
  await ana.page.reload({ waitUntil: "networkidle" });
  await expect(ana.page.getByRole("button", { name: `Play ${TRACKS.public.title}` })).toBeVisible();
  const theirs = ana.page.getByRole("list", { name: /Messages with/ }).getByRole("listitem").filter({ hasText: "Thanks! Try this" });
  await theirs.hover();
  await theirs.getByRole("button", { name: "Message actions" }).click();
  await ana.page.getByRole("menuitem", { name: "Report message" }).click();
  await ana.page.getByRole("radio", { name: "Spam or scam" }).check();
  await ana.page.getByRole("button", { name: "Send report" }).click();
  await expect(ana.page.getByText("Thanks — we'll review this.")).toBeVisible();
  expect(await db.report.count({ where: { targetType: "MESSAGE", reporterId: ana.id } })).toBe(1);

  // Deleting hides it for Ana only
  await ana.page.keyboard.press("Escape");
  ana.page.once("dialog", (dialog) => void dialog.accept());
  await ana.page.getByRole("button", { name: /Conversation actions for/ }).click();
  await ana.page.getByRole("menuitem", { name: "Delete conversation" }).click();
  await expect(ana.page).toHaveURL(/\/messages$/);
  await expect(ana.page.getByText("No conversations yet")).toBeVisible();
  await bo.page.reload({ waitUntil: "networkidle" });
  await expect(bo.page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: /E2E User/ })).toBeVisible();

  await ana.context.close();
  await bo.context.close();
});

test("messages: a link to a track can be sent from the Share dialog", async ({ browser, baseURL }) => {
  const ana = await person(browser, baseURL!);
  const bo = await person(browser, baseURL!);
  await db.user.update({ where: { id: bo.id }, data: { messagePolicy: "EVERYONE" } });
  await ana.page.goto(`/messages?to=${bo.username}`, { waitUntil: "networkidle" });
  await ana.page.getByLabel("Message", { exact: true }).fill("hi");
  await ana.page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(ana.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);

  await ana.page.goto(TRACKS.public.path, { waitUntil: "networkidle" });
  await ana.page.getByRole("button", { name: /More actions for/ }).first().click();
  await ana.page.getByRole("menuitem", { name: "Share" }).click();
  await ana.page.getByRole("tab", { name: "Message" }).click();
  await ana.page.getByLabel("Add a note").fill("check this");
  await ana.page.getByRole("button", { name: "Send to E2E User" }).click();
  await expect(ana.page.getByRole("button", { name: "Sent to E2E User" })).toBeVisible();
  const last = await db.message.findFirstOrThrow({ where: { senderId: ana.id }, orderBy: { createdAt: "desc" } });
  expect(last.body).toBe(`check this\n${baseURL}${TRACKS.public.path}`);
  await ana.context.close();
  await bo.context.close();
});

test("messages: accessible, and the list and thread are separate screens on a phone", async ({ browser, baseURL }) => {
  const ana = await person(browser, baseURL!, { width: 390, height: 800 });
  const bo = await person(browser, baseURL!);
  await db.user.update({ where: { id: bo.id }, data: { messagePolicy: "EVERYONE" } });
  await ana.page.goto(`/messages?to=${bo.username}`, { waitUntil: "networkidle" });
  await ana.page.getByLabel("Message", { exact: true }).fill("hello on a phone");
  await ana.page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(ana.page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
  await expect(ana.page.getByRole("navigation", { name: "Conversations" })).toBeHidden();
  const thread = await new AxeBuilder({ page: ana.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(thread.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  await ana.page.getByRole("link", { name: "Back to conversations" }).click();
  await expect(ana.page.getByRole("navigation", { name: "Conversations" })).toBeVisible();
  await expect(ana.page.getByRole("list", { name: /Messages with/ })).toBeHidden();
  const list = await new AxeBuilder({ page: ana.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(list.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // anonymous visitors go to sign in
  const anonymous = await browser.newContext({ baseURL });
  const page = await anonymous.newPage();
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/signin/);
  await anonymous.close();
  await ana.context.close();
  await bo.context.close();
});
