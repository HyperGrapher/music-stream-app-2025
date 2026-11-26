import type { APIRequestContext, Browser, BrowserContext, Page, Route } from "@playwright/test";

import { createPrismaClient } from "../../src/server/prisma-client";

/** Direct access to the TEST database (never DATABASE_URL), for arranging data the UI cannot. */
export const db = createPrismaClient(process.env.TEST_DATABASE_URL!);

export const PASSWORD = "e2e-password-123";

/** The first link of the latest stored (LOGGED) email of a template for an address (QA-4). */
export async function latestEmailLink(to: string, template: string) {
  const mail = await db.emailMessage.findFirst({ where: { to, template }, orderBy: { createdAt: "desc" } });
  const href = /href="([^"]+)"/.exec(mail?.bodyHtml ?? "")?.[1];
  return href?.replaceAll("&amp;", "&") ?? null;
}

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${crypto.randomUUID()}@example.test`;

/** Signs up through the real auth endpoint; the session cookie lands in `request`'s context. */
export async function signUp(
  request: APIRequestContext,
  baseURL: string,
  email = uniqueEmail("user"),
  { verified = true, onboarded = true }: { verified?: boolean; onboarded?: boolean } = {},
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
  // Most specs are about something other than accounts: skip the verification email and onboarding.
  await db.user.update({
    where: { id: body.user.id },
    data: { ...(verified ? { emailVerified: true } : {}), ...(onboarded ? { onboardedAt: new Date(), favoriteGenres: ["rock", "pop", "electronic"] } : {}) },
  });
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

/** n seconds of an 8 kHz mono 16-bit sine wave: tiny, and every browser can decode it. */
export function sineWav(seconds = 2, sampleRate = 8000, hz = 440) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * 12000), 44 + i * 2);
  return buffer;
}

/**
 * Replaces object storage for the upload pipeline with the database: `getUploadUrl` creates the asset row
 * and points the browser at a fake PUT target, `markUploadComplete` flips it to READY with the analysis the
 * browser really computed. Publishing (`createTrack` / `createCollection`) then runs for real against these
 * rows, so the whole UI flow is tested without R2 credentials or CORS.
 */
export async function mockUploadStorage(page: Page, userId: string, baseURL: string) {
  type Call = { json: Record<string, unknown> };

  await page.route("**/__e2e-put/**", (route) => route.fulfill({ status: 200, body: "" }));
  // tRPC batches calls made in the same tick into one request (`/api/trpc/a,b,c`): answer each by its own procedure.
  await page.route("**/api/trpc/upload.*", async (route) => {
    const url = new URL(route.request().url());
    const procedures = decodeURIComponent(url.pathname.split("/api/trpc/")[1] ?? "").split(",");
    const body = route.request().postDataJSON() as Record<string, Call>;
    if (!procedures.every((p) => ["upload.getUploadUrl", "upload.markUploadComplete", "upload.cancelUpload"].includes(p))) return route.fallback();
    const outputs: unknown[] = [];
    for (const [index, procedure] of procedures.entries()) {
      const input = body[String(index)]!.json;
      if (procedure === "upload.getUploadUrl") {
        const id = crypto.randomUUID();
        await db.mediaAsset.create({
          data: { id, ownerId: userId, kind: "AUDIO", bucket: "e2e-bucket", storageKey: `uploads/${userId}/${id}-${String(input.filename)}`, originalFilename: String(input.filename), mimeType: String(input.contentType), expiresAt: new Date(Date.now() + 86_400_000) },
        });
        outputs.push({ uploadUrl: `${baseURL}/__e2e-put/${id}`, mediaAssetId: id });
      } else if (procedure === "upload.markUploadComplete") {
        const analysis = input.analysis as { durationMs: number; sampleRate: number; channels: number };
        await db.mediaAsset.update({ where: { id: String(input.mediaAssetId) }, data: { status: "READY", uploadedAt: new Date(), byteSize: BigInt(1000) } });
        await db.audioAnalysis.create({ data: { audioAssetId: String(input.mediaAssetId), status: "READY", durationMs: analysis.durationMs, sampleRate: analysis.sampleRate, channels: analysis.channels, completedAt: new Date() } });
        outputs.push({ success: true, durationMs: analysis.durationMs });
      } else {
        outputs.push({ success: true, message: "canceled" });
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(outputs.map((json) => ({ result: { data: { json } } }))) });
  });
}
