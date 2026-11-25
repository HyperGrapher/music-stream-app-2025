import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { db, signUp } from "./helpers";

/**
 * The whole creator journey against REAL Cloudflare R2: browser upload -> in-browser waveform
 * analysis -> publish -> playback through the presigned redirect.
 *
 * Opt-in because it needs credentials and a CORS rule on the bucket that allows this origin:
 *   E2E_R2=1 E2E_PORT=3000 TEST_DATABASE_URL=... pnpm test:e2e
 * (R2_* come from .env / the environment; the bucket's CORS must allow the E2E_PORT origin.)
 */
test.skip(process.env.E2E_R2 !== "1", "needs real R2 credentials and bucket CORS for this origin");

let userId: string | undefined;
const r2 = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

test.afterAll(async () => {
  if (userId) {
    const client = r2();
    for (const prefix of ["uploads", "waveforms", "artworks"]) {
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: `${prefix}/${userId}/` }),
      );
      if (listed.Contents?.length) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) },
          }),
        );
      }
    }
    await db.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect();
});

/** 3 s, 8 kHz, mono, 16-bit PCM sine wave: small, and every browser can decode it. */
function sineWav(seconds = 3, sampleRate = 8000) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000), 44 + i * 2);
  }
  return buffer;
}

test("upload, analyse in the browser, publish and play", async ({ page, baseURL }) => {
  const user = await signUp(page.request, baseURL!);
  userId = user.id;

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

  await page.goto("/upload");
  await page.locator("#files").setInputFiles({
    name: "tone.wav",
    mimeType: "audio/wav",
    buffer: sineWav(),
  });
  await expect(page.getByText("Upload complete")).toBeVisible({ timeout: 45_000 });

  // The browser decoded the file and the server stored duration + waveform.
  const asset = await db.mediaAsset.findFirstOrThrow({
    where: { ownerId: user.id, kind: "AUDIO", status: "READY" },
    include: { audioAnalysis: true },
  });
  expect(asset.audioAnalysis?.status).toBe("READY");
  expect(asset.audioAnalysis?.durationMs).toBe(3000);
  expect(asset.audioAnalysis?.overviewWaveformAssetId).not.toBeNull();

  // Artwork: a 1500x1000 JPEG becomes square WebP renditions; the original is deleted.
  const jpeg = await sharp({
    create: { width: 1500, height: 1000, channels: 3, background: { r: 230, g: 90, b: 20 } },
  })
    .jpeg()
    .toBuffer();
  await page.getByRole("button", { name: "Continue to Details" }).click();
  await page.locator('input[type="file"][accept*="image"]').setInputFiles({
    name: "cover.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  await expect(page.getByAltText("Artwork preview")).toBeVisible({ timeout: 30_000 });
  const artwork = await db.mediaAsset.findFirstOrThrow({
    where: { ownerId: user.id, kind: "IMAGE", status: "READY" },
  });
  expect(artwork.imageWidths).toEqual([96, 320, 640]);
  expect(artwork.mimeType).toBe("image/webp");
  expect(artwork.storageKey).toBe(`artworks/${user.id}/${artwork.id}/640.webp`);
  const stored = await r2().send(
    new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME, Prefix: `artworks/${user.id}/` }),
  );
  expect((stored.Contents ?? []).map((o) => o.Key).sort()).toEqual(
    [96, 320, 640].map((w) => `artworks/${user.id}/${artwork.id}/${w}.webp`).sort(),
  );

  const published = await page.request.post("/api/trpc/upload.createTrack?batch=1", {
    headers: { origin: baseURL! },
    data: {
      0: {
        json: {
          title: "E2E Tone",
          mediaAssetId: asset.id,
          artworkAssetId: artwork.id,
          genre: "electronic",
          privacy: "public",
        },
      },
    },
  });
  expect(published.ok()).toBe(true);
  const track = await db.track.findFirstOrThrow({ where: { audioAssetId: asset.id } });

  // The waveform route serves what the browser computed.
  const waveform = await page.request.get(`/api/tracks/${track.id}/waveform`);
  expect(waveform.status()).toBe(200);
  expect(((await waveform.json()) as { length: number }).length).toBe(60); // 3 s x 20 px/s

  // Each rendition is reachable through the redirect route, at its real size.
  for (const width of [96, 320, 640]) {
    const response = await page.request.get(`/api/tracks/${track.id}/artwork?w=${width}`);
    expect(response.status()).toBe(200);
    const meta = await sharp(await response.body()).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", width, width]);
  }

  await page.goto(`/track/${track.id}`);
  const hero = page.getByAltText("E2E Tone artwork");
  await expect(hero).toHaveAttribute("srcset", /\?w=96 96w, .*\?w=320 320w, .*\?w=640 640w/);
  // On this 1x desktop viewport the hero box is 320 px wide: the browser picks the 320 rendition.
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\?w=320$/);
  await page.locator("button:has(svg.lucide-play)").first().click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const audio = (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0];
          return audio ? { time: audio.currentTime, paused: audio.paused } : null;
        }),
      { timeout: 20_000 },
    )
    .toMatchObject({ paused: false });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.currentTime ?? 0),
    )
    .toBeGreaterThan(0.5);

  // A comment posted while listening is stored with the second the player was at, to the second.
  const position = () =>
    page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.currentTime ?? 0);
  await expect.poll(position, { timeout: 15_000 }).toBeGreaterThan(1);
  await expect(page.getByLabel(/Comment at/)).toBeChecked();
  await page.getByRole("textbox", { name: "Write a comment" }).fill("right here");
  const before = await position();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const after = await position();
  await expect(page.getByTestId("comment").filter({ hasText: "right here" })).toBeVisible();

  const comment = await db.comment.findFirstOrThrow({ where: { trackId: track.id } });
  expect(comment.timestampSeconds).not.toBeNull();
  // The audio keeps playing while the request is in flight, so allow the span of that moment.
  expect(comment.timestampSeconds!).toBeGreaterThanOrEqual(Math.floor(before));
  expect(comment.timestampSeconds!).toBeLessThanOrEqual(Math.ceil(after) + 1);
  expect(comment.timestampSeconds!).toBeLessThanOrEqual(3); // the track is 3 s long
});
