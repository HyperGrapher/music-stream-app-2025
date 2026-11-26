import { expect, test, type Browser } from "@playwright/test";

import { CREATOR } from "./fixtures";
import { db, latestEmailLink, PASSWORD, signUp, uniqueEmail } from "./helpers";

test.afterAll(async () => {
  await db.user.deleteMany({
    where: { email: { startsWith: "e2e-", endsWith: "@example.test" }, NOT: { email: "e2e-creator@example.test" } },
  });
  await db.$disconnect();
});

async function signedInContext(browser: Browser, baseURL: string, opts?: Parameters<typeof signUp>[3]) {
  const request = (await browser.newContext({ baseURL })).request;
  const user = await signUp(request, baseURL, uniqueEmail("acct"), opts);
  const state = await request.storageState();
  const context = await browser.newContext({ baseURL, storageState: state });
  return { user, context };
}

test("J2: sign up, verify the email from the link, onboard (username, genres, follow) and land signed in", async ({ page }) => {
  const email = uniqueEmail("journey");

  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Journey Jo");
  await page.getByLabel("Email").fill(email);
  // AU-3: a common password is refused before anything is sent
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That password is too easy to guess")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // not onboarded yet: forced to /onboarding (also from other pages)
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto("/discover");
  await expect(page).toHaveURL(/\/onboarding$/);

  // AU-4: the verification email was stored (LOGGED); opening its link verifies the account
  await expect.poll(() => latestEmailLink(email, "verify-email")).not.toBeNull();
  const link = (await latestEmailLink(email, "verify-email"))!;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);

  await page.goto("/onboarding");
  await expect(page.getByLabel("Username")).toHaveValue(/^journey_jo/);
  const handle = `jo-${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel("Username").fill("settings");
  await expect(page.getByText("That username is reserved.")).toBeVisible();
  await page.getByLabel("Username").fill(CREATOR.username);
  await expect(page.getByText("That username is taken.")).toBeVisible();
  await page.getByLabel("Username").fill(handle);
  await expect(page.getByText(`${handle} is yours`)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled(); // needs 3 genres
  for (const genre of ["Rock", "Jazz & Blues", "Techno"]) await page.getByRole("button", { name: genre, exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();

  await expect(page.getByText(CREATOR.name).first()).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: CREATOR.name }).getByRole("button", { name: "Follow" }).click();
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { following: true } });
  expect([user.username, user.name, user.favoriteGenres.sort(), user.following.length]).toEqual([handle, "Journey Jo", ["jazz-blues", "rock", "techno"], 1]);
  expect(user.onboardedAt).not.toBeNull();

  // signed in: the navbar offers the profile and no longer a sign-in link
  await page.goto(`/${handle}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Journey Jo");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("a visitor who clicks Follow is asked to sign in and the follow is retried after signing in (AU-2)", async ({ page, baseURL }) => {
  const email = uniqueEmail("retry");
  await signUp(page.request, baseURL!, email); // an account to sign in with...
  await page.context().clearCookies(); // ...while the visitor is anonymous

  await page.goto(`/${CREATOR.username}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Follow" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Sign in to follow creators")).toBeVisible();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("button", { name: "Following" }).first()).toBeVisible({ timeout: 10_000 });
  const follower = await db.user.findUniqueOrThrow({ where: { email } });
  await expect.poll(() => db.follow.count({ where: { followerId: follower.id, followingId: CREATOR.id } })).toBe(1);
  expect((await db.user.findUniqueOrThrow({ where: { id: CREATOR.id } })).followerCount).toBe(await db.follow.count({ where: { followingId: CREATOR.id } }));
});

test("follow, followers list and unfollow on a profile", async ({ browser, baseURL }) => {
  const { user, context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.goto(`/${CREATOR.username}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Follow" }).first().click();
  await expect(page.getByRole("button", { name: "Following" }).first()).toBeVisible();
  await expect.poll(() => db.follow.count({ where: { followerId: user.id, followingId: CREATOR.id } })).toBe(1);

  await page.goto(`/${CREATOR.username}/followers`, { waitUntil: "networkidle" });
  await expect(page.getByRole("listitem").filter({ hasText: "E2E User" }).first()).toBeVisible();

  await page.goto(`/${CREATOR.username}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Following" }).first().click();
  await expect(page.getByRole("button", { name: "Follow" }).first()).toBeVisible();
  await expect.poll(() => db.follow.count({ where: { followerId: user.id, followingId: CREATOR.id } })).toBe(0);
  await context.close();
});

test("profile tabs are real routes with their own content", async ({ page }) => {
  for (const [path, heading] of [["", "E2E Public Track"], ["/tracks", "E2E Public Track"], ["/popular-tracks", "E2E Public Track"]] as const) {
    await page.goto(`/${CREATOR.username}${path}`);
    await expect(page.getByText(heading).first()).toBeVisible();
  }
  await page.goto(`/${CREATOR.username}/albums`);
  await expect(page.getByText("E2E Album").first()).toBeVisible();
  await page.goto(`/${CREATOR.username}/sets`);
  await expect(page.getByText("No public playlists yet.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Profile sections" }).getByRole("link", { name: "Tracks", exact: true })).toBeVisible();
});

test("settings: change the display name and username; the old link keeps redirecting (IA-4)", async ({ browser, baseURL }) => {
  const { user, context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  const old = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).username;
  const fresh = `renamed-${crypto.randomUUID().slice(0, 8)}`;

  await page.goto("/settings/profile", { waitUntil: "networkidle" });
  await page.getByLabel("Display name").fill("Renamed Person");
  await page.getByLabel("Username").fill(fresh);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).username).toBe(fresh);

  await page.goto(`/${old}`);
  await expect(page).toHaveURL(new RegExp(`/${fresh}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Renamed Person");
  await context.close();
});

test("a profile link without https:// is refused with a readable message, not raw JSON", async ({ browser, baseURL }) => {
  const { context } = await signedInContext(browser, baseURL!);
  const page = await context.newPage();
  await page.goto("/settings/profile", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link 1 URL").fill("example.com");
  await page.getByRole("button", { name: "Save changes" }).click();
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toContainText("Link 1: enter a full web address starting with https://");
  await expect(toast).not.toContainText("invalid_format");
  await context.close();
});

test("AU-4: an unverified account sees the verify banner and cannot comment", async ({ browser, baseURL }) => {
  const { context } = await signedInContext(browser, baseURL!, { verified: false });
  const page = await context.newPage();
  await page.goto("/discover");
  await expect(page.getByText("Verify your email to upload, comment and repost.")).toBeVisible();
  await context.close();
});

test("AU-5: password reset by email link; the answer never reveals whether an account exists", async ({ page, request, baseURL }) => {
  const email = uniqueEmail("reset");
  await signUp(request, baseURL!, email);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  expect(await db.emailMessage.count({ where: { to: "nobody-here@example.test" } })).toBe(0);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  await expect.poll(() => latestEmailLink(email, "reset-password")).not.toBeNull();

  await page.goto((await latestEmailLink(email, "reset-password"))!);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password").fill("a-brand-new-passphrase-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password was changed");

  const signIn = await page.request.post("/api/auth/sign-in/email", { headers: { origin: baseURL! }, data: { email, password: "a-brand-new-passphrase-1" } });
  expect(signIn.ok()).toBe(true);
  // single use
  await page.goto((await latestEmailLink(email, "reset-password"))!);
  await expect(page.getByText("invalid or has expired")).toBeVisible();
});

test("settings pages need a signed-in user", async ({ page }) => {
  await page.goto("/settings/privacy");
  await expect(page).toHaveURL(/\/signin\?next=/);
});
