import type { APIRequestContext, Browser, BrowserContext } from "@playwright/test";

import { createPrismaClient } from "../../src/server/prisma-client";

/** Direct access to the TEST database (never DATABASE_URL), for arranging data the UI cannot. */
export const db = createPrismaClient(process.env.TEST_DATABASE_URL!);

export const PASSWORD = "e2e-password-123";

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${crypto.randomUUID()}@example.test`;

/** Signs up through the real auth endpoint; the session cookie lands in `request`'s context. */
export async function signUp(
  request: APIRequestContext,
  baseURL: string,
  email = uniqueEmail("user"),
) {
  const attempt = () =>
    request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL },
      data: { email, password: PASSWORD, name: "E2E User" },
    });
  let response = await attempt();
  if (response.status() === 429) {
    // Better Auth's rate limiter: wait out the window it announces, then retry once.
    const wait = Number(response.headers()["x-retry-after"] ?? 10);
    await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
    response = await attempt();
  }
  if (!response.ok()) throw new Error(`sign-up failed: ${response.status()}`);
  const body = (await response.json()) as { user: { id: string } };
  return { id: body.user.id, email };
}

/** A fresh browser context with no cookies: an anonymous visitor. */
export async function anonymousContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext();
}

/** Creates an attached audio asset + a published track for `ownerId`; returns the row with its permalink. */
export async function createTrackFor(
  ownerId: string,
  visibility: "PUBLIC" | "PRIVATE",
  title: string,
) {
  const owner = await db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { username: true } });
  const audio = await db.mediaAsset.create({
    data: {
      ownerId,
      kind: "AUDIO",
      status: "ATTACHED",
      bucket: "e2e-bucket",
      storageKey: `uploads/${ownerId}/${crypto.randomUUID()}-test.mp3`,
      originalFilename: "test.mp3",
      mimeType: "audio/mpeg",
    },
  });
  await db.audioAnalysis.create({ data: { audioAssetId: audio.id, status: "FAILED", durationMs: 30_000 } });
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`;
  const track = await db.track.create({
    data: {
      creatorId: ownerId,
      slug,
      audioAssetId: audio.id,
      title,
      visibility,
      publishedAt: visibility === "PUBLIC" ? new Date() : null,
      secretToken: crypto.randomUUID().replaceAll("-", "").slice(0, 22),
      durationMs: 30_000,
      mimeType: "audio/mpeg",
    },
  });
  return { ...track, path: `/${owner.username}/${slug}` };
}
