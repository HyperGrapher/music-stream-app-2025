import { expect, test } from "@playwright/test";

import { ALBUM, CREATOR, PRIVATE_SECRET, PRIVATE_SET, TRACKS } from "./fixtures";

test.describe("public pages", () => {
  test("the home page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("independent creators");
  });

  test("a creator profile lists public tracks only (IA: /{username})", async ({ page }) => {
    const response = await page.goto(`/${CREATOR.username}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("E2E Creator").first()).toBeVisible();
    await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
    for (const hidden of [TRACKS.private, TRACKS.scheduled]) {
      await expect(page.getByText(hidden.title)).toHaveCount(0);
    }
  });

  test("usernames are case-insensitive, legacy /u and /track urls redirect to the permalink", async ({ page, request }) => {
    expect((await page.goto(`/${CREATOR.username.toUpperCase()}`))?.status()).toBe(200);
    const legacyProfile = await request.get(`/u/${CREATOR.id}`, { maxRedirects: 0 });
    expect([legacyProfile.status(), legacyProfile.headers().location]).toEqual([308, `/${CREATOR.username}`]);
    const legacyTrack = await request.get(`/track/${TRACKS.public.id}`, { maxRedirects: 0 });
    expect([legacyTrack.status(), legacyTrack.headers().location]).toEqual([308, TRACKS.public.path]);
    // hidden tracks stay hidden through the legacy route too
    expect((await request.get(`/track/${TRACKS.private.id}`, { maxRedirects: 0 })).status()).toBe(404);
  });

  test("track pages: public opens for anyone; private and scheduled are a 404 (J7, J8)", async ({ page }) => {
    const response = await page.goto(TRACKS.public.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain(TRACKS.public.path);

    for (const hidden of [TRACKS.private, TRACKS.scheduled]) {
      expect((await page.goto(hidden.path))?.status(), hidden.title).toBe(404);
    }
  });

  test("J7: the secret link opens a private track, a wrong token does not, and the page is not indexable", async ({ page }) => {
    const ok = await page.goto(`${TRACKS.private.path}/s-${PRIVATE_SECRET}`);
    expect(ok?.status()).toBe(200);
    await expect(page.getByText(TRACKS.private.title).first()).toBeVisible();
    expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
    expect((await page.goto(`${TRACKS.private.path}/s-wrongtokenwrongtoken1`))?.status()).toBe(404);
    expect((await page.goto(`${TRACKS.private.path}/not-a-secret`))?.status()).toBe(404);
  });

  test("a collection page lists its tracks in order and links to each permalink", async ({ page }) => {
    expect((await page.goto(ALBUM.path))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ALBUM.title);
    await expect(page.getByText("Album", { exact: true }).first()).toBeVisible();
    const titles = await page.locator("main a[href^='/e2e-creator/e2e-album-']").evaluateAll((links) =>
      links.map((link) => link.textContent?.trim()).filter(Boolean),
    );
    expect(titles.slice(0, 2)).toEqual(ALBUM.tracks.map((t) => t.title));
  });

  test("a private collection needs its secret; unavailable tracks keep their place but show no details (VI-3)", async ({ page }) => {
    expect((await page.goto(PRIVATE_SET.path))?.status()).toBe(404);
    expect((await page.goto(`${PRIVATE_SET.path}/s-${PRIVATE_SET.secret}`))?.status()).toBe(200);
    await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
    // the private track belongs to the same owner, so the collection secret opens it
    await expect(page.getByText(TRACKS.private.title).first()).toBeVisible();
    await expect(page.getByTestId("unavailable-track")).toHaveCount(0);
  });
});

test.describe("media routes", () => {
  test("stream redirects to a presigned R2 URL for viewable tracks", async ({ request }) => {
    const response = await request.get(`/api/tracks/${TRACKS.public.id}/stream`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers().location ?? "";
    expect(location).toContain("r2.cloudflarestorage.com");
    expect(location).toContain("X-Amz-Signature=");
  });

  test("private tracks stream only with the right secret; scheduled and unknown ones never", async ({ request }) => {
    const id = TRACKS.private.id;
    expect((await request.get(`/api/tracks/${id}/stream`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get(`/api/tracks/${id}/stream?s=wrong`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get(`/api/tracks/${id}/stream?s=${PRIVATE_SECRET}`, { maxRedirects: 0 })).status()).toBe(307);
    // the secret of a collection that contains the track opens it, via ?c=&s=
    const viaSet = await request.get(`/api/tracks/${id}/stream?c=${PRIVATE_SET.id}&s=${PRIVATE_SET.secret}`, { maxRedirects: 0 });
    expect(viaSet.status()).toBe(307);
    expect((await request.get(`/api/tracks/${id}/waveform?s=${PRIVATE_SECRET}`)).status()).not.toBe(404);
    expect((await request.get(`/api/tracks/${id}/waveform`)).status()).toBe(404);

    expect((await request.get(`/api/tracks/${TRACKS.scheduled.id}/stream`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get(`/api/tracks/${crypto.randomUUID()}/stream`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get(`/api/tracks/not-an-id/stream`, { maxRedirects: 0 })).status()).toBe(404);
  });

  test("the cron endpoint refuses callers without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    expect((await request.get("/api/cron/daily", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
  });

  test("a repeated play from the same client counts once", async ({ request }) => {
    const playCount = async () => {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: { username: CREATOR.username, slug: TRACKS.plays.slug } } }));
      const response = await request.get(`/api/trpc/tracks.byPermalink?batch=1&input=${input}`);
      const body = (await response.json()) as { result: { data: { json: { track: { playCount: number } } } } }[];
      return body[0]!.result.data.json.track.playCount;
    };

    expect(await playCount()).toBe(0);
    for (let i = 0; i < 3; i++) {
      const response = await request.post(`/api/tracks/${TRACKS.plays.id}/play`);
      expect(response.status()).toBe(204);
    }
    expect(await playCount()).toBe(1);
  });

  test("playing a private track is refused unless the secret is given", async ({ request }) => {
    expect((await request.post(`/api/tracks/${TRACKS.private.id}/play`)).status()).toBe(404);
  });
});
