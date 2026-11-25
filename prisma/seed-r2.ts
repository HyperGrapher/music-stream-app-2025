/**
 * Registers media that already exists in the R2 bucket as demo content:
 * one creator, one track per uploads/*.mp3|ogg with its artwork and waveform.
 *
 * Idempotent (keyed on storageKey). Waveforms carry no link to their audio, so
 * they are paired by duration: overview.json length / 20 px per second vs the
 * ffprobe duration of the downloaded audio (must agree within 0.5 s).
 *
 *   pnpm db:seed:r2
 */
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";
import { createPrismaClient } from "../src/server/prisma-client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prisma = createPrismaClient(process.env.DATABASE_URL!);
const bucket = process.env.R2_BUCKET_NAME!;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function listAll() {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await r2.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) out.push({ key: o.Key!, size: o.Size ?? 0 });
    token = page.NextContinuationToken;
  } while (token);
  return out;
}

const mime = (key: string) =>
  key.endsWith(".mp3") ? "audio/mpeg"
  : key.endsWith(".ogg") ? "audio/ogg"
  : key.endsWith(".png") ? "image/png"
  : key.endsWith(".jpg") ? "image/jpeg"
  : key.endsWith(".json") ? "application/json"
  : "application/octet-stream";

const titleOf = (key: string) =>
  key.split("/").pop()!
    .replace(/^[0-9a-f-]{36}-/, "").replace(/^\d+-/, "")
    .replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();

async function probeSeconds(key: string): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "seed-r2-"));
  try {
    const file = join(dir, "audio");
    const obj = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    writeFileSync(file, await obj.Body!.transformToByteArray());
    return Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString(),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const objects = await listAll();
  const audio = objects.filter((o) => /^uploads\/.+\.(mp3|ogg)$/.test(o.key));
  const artworks = objects.filter((o) => o.key.startsWith("artworks/"));
  const overviews = objects.filter((o) => o.key.endsWith("/overview.json"));

  const waveformLength = new Map<string, number>();
  for (const o of overviews) {
    const body = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: o.key }));
    const json = JSON.parse((await body.Body!.transformToString())) as { length: number };
    waveformLength.set(o.key, json.length / 20);
  }

  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      id: crypto.randomUUID(),
      name: "Demo Creator",
      email: "demo@example.com",
      emailVerified: true,
      bio: "Demo tracks served from Cloudflare R2.",
    },
  });

  const unpaired = new Set(overviews.map((o) => o.key));
  const sorted = [...audio].sort((a, b) => a.size - b.size);
  let artIdx = 0;

  for (const a of sorted) {
    if (await prisma.mediaAsset.findUnique({ where: { storageKey: a.key } })) continue;
    const seconds = await probeSeconds(a.key);
    const [best] = [...unpaired].sort(
      (x, y) => Math.abs(waveformLength.get(x)! - seconds) - Math.abs(waveformLength.get(y)! - seconds),
    );
    const match = best && Math.abs(waveformLength.get(best)! - seconds) < 0.5 ? best : undefined;
    if (match) unpaired.delete(match);

    const base = { ownerId: user.id, bucket, status: "ATTACHED" as const, uploadedAt: new Date(), attachedAt: new Date() };
    const audioAsset = await prisma.mediaAsset.create({
      data: { ...base, kind: "AUDIO", storageKey: a.key, originalFilename: a.key.split("/").pop()!, mimeType: mime(a.key), byteSize: BigInt(a.size) },
    });

    let artworkAssetId: string | undefined;
    const art = artworks[artIdx++ % Math.max(artworks.length, 1)];
    if (art) {
      const existing = await prisma.mediaAsset.findUnique({ where: { storageKey: art.key } });
      artworkAssetId = (existing ?? (await prisma.mediaAsset.create({
        data: { ...base, kind: "IMAGE", storageKey: art.key, originalFilename: art.key.split("/").pop()!, mimeType: mime(art.key), byteSize: BigInt(art.size) },
      }))).id;
    }

    let overviewId: string | undefined;
    let detailId: string | undefined;
    if (match) {
      const mk = (key: string, size: number) =>
        prisma.mediaAsset.create({
          data: { ...base, kind: "WAVEFORM", storageKey: key, originalFilename: key.split("/").pop()!, mimeType: mime(key), byteSize: BigInt(size) },
        });
      overviewId = (await mk(match, overviews.find((o) => o.key === match)!.size)).id;
      const detailKey = match.replace("overview.json", "detail.dat");
      const detail = objects.find((o) => o.key === detailKey);
      if (detail) detailId = (await mk(detailKey, detail.size)).id;
    }

    await prisma.audioAnalysis.create({
      data: {
        audioAssetId: audioAsset.id,
        status: overviewId ? "READY" : "QUEUED",
        durationMs: Math.round(seconds * 1000),
        overviewWaveformAssetId: overviewId,
        detailWaveformAssetId: detailId,
        completedAt: overviewId ? new Date() : null,
      },
    });
    const track = await prisma.track.create({
      data: { creatorId: user.id, audioAssetId: audioAsset.id, artworkAssetId, title: titleOf(a.key), visibility: "PUBLIC" },
    });
    console.log(`track ${track.id} ${track.title} (${overviewId ? "waveform ok" : "no waveform"})`);
  }
  console.log(`creator ${user.id}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => void prisma.$disconnect());
