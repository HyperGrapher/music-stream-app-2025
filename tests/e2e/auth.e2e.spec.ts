import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

import { anonymousContext, createTrackFor, db, PASSWORD, signUp, uniqueEmail } from "./helpers";

// Better Auth rate-limits sign-ups (a few per 10 s per IP), which is real production behaviour we
// keep enabled. So: sign up once, share the session, and sign up only once more for the login test.
let user: { id: string; email: string };
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  user = await signUp(request, baseURL!);
  storageState = await request.storageState();
  await request.dispose();
});

test.afterAll(async () => {
  await db.user.deleteMany({
    where: {
      email: { startsWith: "e2e-", endsWith: "@example.test" },
      NOT: { email: "e2e-creator@example.test" },
    },
  });
  await db.$disconnect();
});

const signedIn = (browser: Browser, baseURL: string) =>
  browser.newContext({ baseURL, storageState });

test("/profile redirects a signed-in user to their profile", async ({ browser, baseURL }) => {
  const context = await signedIn(browser, baseURL!);
  const page = await context.newPage();
  await page.goto("/profile");
  const { username } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { username: true } });
  await expect(page).toHaveURL(new RegExp(`/${username}$`));
  await context.close();
});

test("an owner sees their private track; everyone else gets a 404", async ({ browser, baseURL }) => {
  const track = await createTrackFor(user.id, "PRIVATE", "Owner Only Track");

  const owner = await signedIn(browser, baseURL!);
  const ownerPage = await owner.newPage();
  const own = await ownerPage.goto(track.path);
  expect(own?.status()).toBe(200);
  await expect(ownerPage.getByText("Owner Only Track").first()).toBeVisible();
  await owner.close();

  const stranger = await anonymousContext(browser);
  const strangerPage = await stranger.newPage();
  const other = await strangerPage.goto(`${baseURL}${track.path}`);
  expect(other?.status()).toBe(404);
  await stranger.close();
});

test("every account gets a permalink handle at sign-up", async () => {
  const { username } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { username: true } });
  expect(username).toMatch(/^e2e_user/);
});

test("the upload page offers the file picker to a signed-in user", async ({ browser, baseURL }) => {
  const context = await signedIn(browser, baseURL!);
  const page = await context.newPage();
  await page.goto("/upload");
  await expect(page.getByText("Upload your tracks")).toBeVisible();
  await expect(page.locator("#files")).toBeVisible();
  await context.close();
});

test("signing in needs the right password", async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const email = uniqueEmail("login");
  await signUp(request, baseURL!, email);
  await request.post("/api/auth/sign-out", { headers: { origin: baseURL! } });

  const wrong = await request.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL! },
    data: { email, password: "definitely-wrong-123" },
  });
  expect(wrong.ok()).toBe(false);

  const right = await request.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL! },
    data: { email, password: PASSWORD },
  });
  expect(right.ok()).toBe(true);
  await request.dispose();
});
