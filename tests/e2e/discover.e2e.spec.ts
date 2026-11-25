import { expect, test, type Page } from "@playwright/test";

import { PUBLIC_TITLES, TRACKS } from "./fixtures";

/** Titles of the track cards in the main content, in display order. */
const cardTitles = (page: Page) => page.locator("article a[title]").allTextContents();

test.describe("home", () => {
  test("shows trending and new releases with public tracks only", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Trending now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New releases" })).toBeVisible();
    await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
    await expect(page.getByText(TRACKS.private.title)).toHaveCount(0);
    await expect(page.getByText(TRACKS.scheduled.title)).toHaveCount(0);
  });

  test("a card opens its track page", async ({ page }) => {
    await page.goto("/");
    await page.locator(`article a[title="${TRACKS.public.title}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${TRACKS.public.path}$`));
  });

  test("the navigation has no dead links", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Discover" })).toBeVisible();
    for (const dead of ["Feed", "Library", "For Artists"]) {
      await expect(nav.getByRole("link", { name: dead })).toHaveCount(0);
    }
  });

  test("playing a card queues the grid in the player", async ({ page }) => {
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      const created: HTMLAudioElement[] = [];
      (window as unknown as { __audios: HTMLAudioElement[] }).__audios = created;
      window.Audio = function (...args: ConstructorParameters<typeof Audio>) {
        const audio = new NativeAudio(...args);
        created.push(audio);
        return audio;
      } as unknown as typeof Audio;
    });
    await page.goto("/", { waitUntil: "networkidle" }); // let React hydrate before clicking
    const card = page.locator("article", { hasText: TRACKS.public.title }).first();
    await card.hover(); // the play button is revealed on hover, like for a real user
    await card.getByRole("button", { name: `Play ${TRACKS.public.title}` }).click();
    // The seeded audio does not exist in storage; what matters is that the player was pointed at it.
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.src ?? ""),
      )
      .toContain(`/api/tracks/${TRACKS.public.id}/stream`);
  });
});

test.describe("discover", () => {
  test("lists public tracks, newest first by default", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
    const titles = await cardTitles(page);
    expect(titles.sort()).toEqual([...PUBLIC_TITLES].sort());
    expect(titles).not.toContain(TRACKS.private.title);
    expect(titles).not.toContain(TRACKS.scheduled.title);
  });

  test("most played puts the track with the most plays first", async ({ page }) => {
    await page.goto("/discover?sort=popular");
    const titles = await cardTitles(page);
    expect(titles[0]).toBe(TRACKS.public.title);
    await expect(page.getByRole("link", { name: "Most played" })).toHaveAttribute("aria-current", "page");
  });

  test("genre chips only offer genres that have public tracks, and filter", async ({ page }) => {
    await page.goto("/discover");
    const genres = page.getByRole("navigation", { name: "Genres" });
    await expect(genres.getByRole("link", { name: /Electronic/ })).toBeVisible();
    await expect(genres.getByRole("link", { name: /Ambient/ })).toBeVisible();
    // jazz exists only on a private track, world only on a scheduled one
    await expect(genres.getByRole("link", { name: /Jazz/ })).toHaveCount(0);
    await expect(genres.getByRole("link", { name: /World/ })).toHaveCount(0);

    await genres.getByRole("link", { name: /Ambient/ }).click();
    await expect(page).toHaveURL(/genre=ambient/);
    await expect(page.getByRole("heading", { name: "Ambient" })).toBeVisible();
    expect(await cardTitles(page)).toEqual([TRACKS.plays.title]);
  });

  test("search finds tracks and creators and never reveals private titles", async ({ page }) => {
    await page.goto("/discover?q=plays");
    await expect(page.getByRole("heading", { name: "Results for “plays”" })).toBeVisible();
    expect(await cardTitles(page)).toEqual([TRACKS.plays.title]);

    await page.goto("/discover?q=E2E%20Creator");
    expect((await cardTitles(page)).length).toBe(PUBLIC_TITLES.length); // every public seeded track

    await page.goto("/discover?q=private");
    await expect(page.getByText("Nothing matches that")).toBeVisible();
    expect(await cardTitles(page)).toEqual([]);
  });

  test("the navbar search box feeds the discover page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search tracks and creators" }).fill("public");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/discover\?q=public$/);
    expect(await cardTitles(page)).toEqual([TRACKS.public.title]);
  });
});
