import AxeBuilder from "@axe-core/playwright";
import { expect, request as playwrightRequest, test, type Browser } from "@playwright/test";

import { db, signUp } from "./helpers";

test.afterAll(async () => {
  await db.reservedName.deleteMany({ where: { name: { startsWith: "e2e-" } } });
  await db.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } } });
  await db.$disconnect();
});

async function admin(browser: Browser, baseURL: string) {
  const request = await playwrightRequest.newContext({ baseURL });
  const { id } = await signUp(request, baseURL);
  await db.user.update({ where: { id }, data: { role: "ADMIN" } });
  const state = await request.storageState();
  await request.dispose();
  const context = await browser.newContext({ baseURL, storageState: state, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

test("admin: reserved names from a text file, block/unblock, and the built-in list stays locked", async ({ browser, baseURL }) => {
  const { context, page } = await admin(browser, baseURL!);
  await page.goto("/admin/reserved", { waitUntil: "networkidle" });
  await page.getByLabel("Text file with one name per line").setInputFiles({ name: "names.txt", mimeType: "text/plain", buffer: Buffer.from("# banned\ne2e-brand\nE2E-Shop\nadmin\nx\n") });
  const report = page.getByRole("status").filter({ hasText: "Added 2 names" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("already reserved by the system");
  await expect(report).toContainText("not a valid username");
  await expect(page.getByTestId("reserved-row").filter({ hasText: "e2e-brand" })).toContainText("Blocked");
  expect(await db.reservedName.count({ where: { name: "admin" } })).toBe(0);

  // a visitor cannot take a blocked name; after unblocking they can
  const check = async (name: string) => {
    const person = await playwrightRequest.newContext({ baseURL });
    const { id } = await signUp(person, baseURL!);
    const result = await person.get(`/api/trpc/account.checkUsername?input=${encodeURIComponent(JSON.stringify({ json: { username: name } }))}`);
    await person.dispose();
    await db.user.delete({ where: { id } }).catch(() => undefined);
    return result.status();
  };
  expect(await check("e2e-brand")).toBeLessThan(500);
  await expect.poll(async () => (await db.reservedName.findUnique({ where: { name: "e2e-brand" } }))?.blocked).toBe(true);

  const row = page.getByTestId("reserved-row").filter({ hasText: "e2e-brand" });
  await row.getByRole("button", { name: /Unblock/ }).click();
  await expect(row).toContainText("Allowed");
  await row.getByRole("button", { name: /^Block/ }).click();
  await expect(row).toContainText("Blocked");
  await row.getByRole("button", { name: /Remove/ }).click();
  await expect(page.getByTestId("reserved-row").filter({ hasText: "e2e-brand" })).toHaveCount(0);

  // built-in names are listed, read-only: no action buttons for them
  const builtIn = page.getByRole("list", { name: "Built-in reserved names" });
  await expect(builtIn.getByText("settings", { exact: true })).toBeVisible();
  await expect(builtIn.getByRole("button")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  await context.close();
});

test("admin: analytics shows a guest from Germany who is on the site now, and the page is accessible", async ({ browser, baseURL }) => {
  const { context, page } = await admin(browser, baseURL!);
  const guestContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-vercel-ip-country": "DE", "x-forwarded-for": "203.0.113.77" } });
  const guest = await guestContext.newPage();
  await guest.goto("/charts?private=1", { waitUntil: "networkidle" });
  await expect.poll(async () => db.pageView.count({ where: { ip: "203.0.113.77", path: "/charts" } })).toBe(1);

  await page.goto("/admin/analytics", { waitUntil: "networkidle" });
  const row = page.getByTestId("online-row").filter({ hasText: "203.0.113.77" });
  await expect(row).toContainText("Guest");
  await expect(row).toContainText("Germany");
  await expect(row).toContainText("/charts");
  expect(Number(await page.getByTestId("online-total").textContent())).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Top pages" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // the query string is not stored, and admin pages are not tracked
  expect(await db.pageView.count({ where: { path: { contains: "private" } } })).toBe(0);
  expect(await db.pageView.count({ where: { path: { startsWith: "/admin" } } })).toBe(0);
  await guestContext.close();
  await context.close();
});
