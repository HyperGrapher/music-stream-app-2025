import { expect, test } from "@playwright/test";

import { CREATOR_ID, TRACKS } from "./fixtures";

test.describe("public pages", () => {
  test("the home page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("Home");
  });

  test("a creator profile lists public tracks only", async ({ page }) => {
    const response = await page.goto(`/u/${CREATOR_ID}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("E2E Creator").first()).toBeVisible();
    await expect(page.getByText(TRACKS.public.title).first()).toBeVisible();
    await expect(page.getByText(TRACKS.unlisted.title)).toHaveCount(0);
    await expect(page.getByText(TRACKS.private.title)).toHaveCount(0);
  });

  test("track pages: public and unlisted open for anyone, private is a 404", async ({ page }) => {
    for (const track of [TRACKS.public, TRACKS.unlisted]) {
      const response = await page.goto(`/track/${track.id}`);
      expect(response?.status(), track.title).toBe(200);
      await expect(page.getByText(track.title).first()).toBeVisible();
    }
    const response = await page.goto(`/track/${TRACKS.private.id}`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("media routes", () => {
  test("stream redirects to a presigned R2 URL for viewable tracks", async ({ request }) => {
    for (const track of [TRACKS.public, TRACKS.unlisted]) {
      const response = await request.get(`/api/tracks/${track.id}/stream`, { maxRedirects: 0 });
      expect(response.status(), track.title).toBe(307);
      const location = response.headers().location ?? "";
      expect(location).toContain("r2.cloudflarestorage.com");
      expect(location).toContain("X-Amz-Signature=");
    }
  });

  test("private and unknown tracks cannot be streamed", async ({ request }) => {
    const priv = await request.get(`/api/tracks/${TRACKS.private.id}/stream`, { maxRedirects: 0 });
    expect(priv.status()).toBe(404);
    const unknown = await request.get(`/api/tracks/${crypto.randomUUID()}/stream`, { maxRedirects: 0 });
    expect(unknown.status()).toBe(404);
    const invalid = await request.get(`/api/tracks/not-an-id/stream`, { maxRedirects: 0 });
    expect(invalid.status()).toBe(404);
  });

  test("a repeated play from the same client counts once", async ({ request }) => {
    const playCount = async () => {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: { trackId: TRACKS.plays.id } } }));
      const response = await request.get(`/api/trpc/artist.getTrack?batch=1&input=${input}`);
      const body = (await response.json()) as { result: { data: { json: { playCount: number } } } }[];
      return body[0]!.result.data.json.playCount;
    };

    expect(await playCount()).toBe(0);
    for (let i = 0; i < 3; i++) {
      const response = await request.post(`/api/tracks/${TRACKS.plays.id}/play`);
      expect(response.status()).toBe(204);
    }
    expect(await playCount()).toBe(1);
  });

  test("playing a private track is refused", async ({ request }) => {
    const response = await request.post(`/api/tracks/${TRACKS.private.id}/play`);
    expect(response.status()).toBe(404);
  });
});
