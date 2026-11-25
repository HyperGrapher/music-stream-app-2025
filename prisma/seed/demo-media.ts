/**
 * Shared demo media in R2 (used by `pnpm db:seed`). The first run builds `demo/manifest.json`:
 * it copies the audio found under `uploads/` to `demo/audio/`, analyses it with ffmpeg (duration +
 * waveform in the same JSON format the browser produces), and turns the artwork pool
 * (`random-artwork-images/`) into renditions under `demo/{artwork,avatars,banners}/`. Later runs
 * (and CI, and other machines without ffmpeg) just read the manifest.
 *
 * Everything lives under `demo/`, a prefix the storage-deletion queue refuses to delete from, so
 * many seeded tracks can safely share one object.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

import { slugify } from "../../src/lib/names";
import { buildAudiowaveformDocument, computePeaks } from "../../src/lib/waveform-compute";
import { processImageObject } from "../../src/server/modules/media/artwork-processing";

export interface DemoAudio {
  key: string;
  waveformKey: string;
  title: string;
  mimeType: string;
  byteSize: number;
  durationMs: number;
}

export interface DemoImage {
  storageKey: string;
  imageWidths: number[];
  byteSize: number;
}

export interface DemoManifest {
  audio: DemoAudio[];
  artwork: DemoImage[];
  avatars: DemoImage[];
  banners: DemoImage[];
}

const MANIFEST_KEY = "demo/manifest.json";
const ANALYSIS_SAMPLE_RATE = 22_050;

const mimeOf = (key: string) => (key.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg");

async function listAll(r2: S3Client, bucket: string, prefix: string) {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const object of page.Contents ?? []) out.push({ key: object.Key!, size: object.Size ?? 0 });
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

const download = async (r2: S3Client, bucket: string, key: string) => {
  const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await object.Body!.transformToByteArray());
};

const titleOf = (key: string) =>
  key
    .split("/")
    .pop()!
    .replace(/^[0-9a-f-]{36}-/, "")
    .replace(/^\d{10,}-/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

/** Duration and a mono envelope decoded by ffmpeg (needs the ffmpeg/ffprobe binaries). */
function analyse(file: string) {
  const raw = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE), "-"],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  return computePeaks([samples], ANALYSIS_SAMPLE_RATE);
}

async function buildAudio(r2: S3Client, bucket: string): Promise<DemoAudio[]> {
  const sources = (await listAll(r2, bucket, "uploads/")).filter((o) => /\.(mp3|ogg)$/.test(o.key));
  // The same recording was uploaded by several old accounts: keep one copy per title and size.
  const unique = [...new Map(sources.map((o) => [`${titleOf(o.key).toLowerCase()}:${o.size}`, o])).values()].sort(
    (a, b) => titleOf(a.key).localeCompare(titleOf(b.key)),
  );

  const dir = mkdtempSync(join(tmpdir(), "demo-audio-"));
  try {
    const result: DemoAudio[] = [];
    for (const [index, source] of unique.entries()) {
      const body = await download(r2, bucket, source.key);
      const file = join(dir, "audio");
      writeFileSync(file, body);
      const waveform = analyse(file);
      const title = titleOf(source.key);
      const base = `demo/audio/${String(index + 1).padStart(2, "0")}-${slugify(title) || "track"}`;
      const extension = source.key.endsWith(".ogg") ? "ogg" : "mp3";
      const key = `${base}.${extension}`;
      const waveformKey = `${base}.waveform.json`;
      await r2.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: mimeOf(key) }));
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: waveformKey,
          Body: JSON.stringify(buildAudiowaveformDocument(waveform.peaks, waveform.sampleRate)),
          ContentType: "application/json",
        }),
      );
      console.log(`  audio ${key} (${Math.round(waveform.durationMs / 1000)} s)`);
      result.push({ key, waveformKey, title, mimeType: mimeOf(key), byteSize: body.length, durationMs: waveform.durationMs });
    }
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function buildImages(
  r2: S3Client,
  bucket: string,
  sources: { key: string }[],
  folder: string,
  purpose: "ARTWORK" | "AVATAR" | "BANNER",
): Promise<DemoImage[]> {
  const result: DemoImage[] = [];
  for (const source of sources) {
    const n = source.key.match(/artwork-(\d+)\.webp$/)![1]!;
    const processed = await processImageObject(r2, {
      bucket,
      sourceKey: source.key,
      base: `demo/${folder}/${n}`,
      purpose,
    });
    result.push({ storageKey: processed.storageKey, imageWidths: processed.imageWidths, byteSize: processed.byteSize });
  }
  return result;
}

export async function loadDemoManifest(r2: S3Client, bucket: string): Promise<DemoManifest> {
  try {
    const existing = await download(r2, bucket, MANIFEST_KEY);
    return JSON.parse(existing.toString("utf8")) as DemoManifest;
  } catch {
    console.log("Building the demo media library in R2 (first run, needs ffmpeg)...");
  }

  const pool = (await listAll(r2, bucket, "random-artwork-images/"))
    .filter((o) => /artwork-\d+\.webp$/.test(o.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (pool.length < 8) throw new Error("The artwork pool in R2 (random-artwork-images/) is missing");

  const manifest: DemoManifest = {
    audio: await buildAudio(r2, bucket),
    artwork: await buildImages(r2, bucket, pool, "artwork", "ARTWORK"),
    // Avatars and banners are cut from the same pool; the seed picks distinct ones per creator.
    avatars: await buildImages(r2, bucket, pool, "avatars", "AVATAR"),
    banners: await buildImages(r2, bucket, pool, "banners", "BANNER"),
  };
  if (manifest.audio.length === 0) throw new Error("No demo audio found under uploads/ in R2");
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
    }),
  );
  return manifest;
}

/** Test/debug helper: read a manifest from disk instead of R2. */
export const readManifestFile = (path: string) => JSON.parse(readFileSync(path, "utf8")) as DemoManifest;
