import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hostname } from "node:os";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AudioAnalysisStatus,
  MediaKind,
  MediaProcessingJobStatus,
  MediaStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import dotenv from "dotenv";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
dotenv.config({ path: path.resolve(packageDirectory, "../web/.env") });

const requiredEnvironment = [
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

for (const name of requiredEnvironment) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const binaries = {
  ffmpeg: process.env.FFMPEG_PATH || "ffmpeg",
  ffprobe: process.env.FFPROBE_PATH || "ffprobe",
  audiowaveform: process.env.AUDIOWAVEFORM_PATH || "audiowaveform",
};

const concurrency = Math.max(
  1,
  Math.min(4, Number.parseInt(process.env.MEDIA_WORKER_CONCURRENCY || "2", 10)),
);
const pollIntervalMs = 1_000;
const commandTimeoutMs = 15 * 60 * 1_000;
const staleLockMs = 20 * 60 * 1_000;
const waveformVersion = 1;
const detailPixelsPerSecond = 100;
const overviewPixelsPerSecond = 20;
const waveformBits = 8;
const processingSampleRate = 44_100;
const workerId = `${hostname()}:${process.pid}:${randomUUID()}`;

const prisma = new PrismaClient({ log: ["error", "warn"] });
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
  maxAttempts: 5,
});

let stopping = false;

type ProbeOutput = {
  streams?: Array<{
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    bit_rate?: string;
    duration?: string;
  }>;
  format?: {
    duration?: string;
    bit_rate?: string;
  };
};

type WaveformJson = {
  version: number;
  channels: number;
  sample_rate: number;
  samples_per_pixel: number;
  bits: number;
  length: number;
  data: number[];
};

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parsePositiveNumber(value: string | number | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseBigInt(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function waitForChild(
  child: ChildProcess,
  label: string,
  getStderr: () => string,
) {
  return new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = getStderr().trim().slice(-4_000);
      reject(
        new Error(
          `${label} exited with ${code ?? signal ?? "unknown"}${stderr ? `: ${stderr}` : ""}`,
        ),
      );
    });
  });
}

async function runCommand(command: string, args: string[], label: string) {
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const timeout = setTimeout(() => child.kill(), commandTimeoutMs);
  try {
    await waitForChild(child, label, () => stderr);
    return stdout;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateDetailWaveform(inputPath: string, outputPath: string) {
  const decoder = spawn(
    binaries.ffmpeg,
    [
      "-v",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-ac",
      "1",
      "-ar",
      String(processingSampleRate),
      "-f",
      "s16le",
      "pipe:1",
    ],
    { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const generator = spawn(
    binaries.audiowaveform,
    [
      "--input-filename",
      "-",
      "--input-format",
      "raw",
      "--raw-samplerate",
      String(processingSampleRate),
      "--raw-channels",
      "1",
      "--raw-format",
      "s16le",
      "--output-filename",
      outputPath,
      "--output-format",
      "dat",
      "--pixels-per-second",
      String(detailPixelsPerSecond),
      "--bits",
      String(waveformBits),
      "--quiet",
    ],
    { shell: false, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] },
  );

  let decoderError = "";
  let generatorError = "";
  decoder.stderr?.setEncoding("utf8");
  generator.stderr?.setEncoding("utf8");
  decoder.stderr?.on("data", (chunk: string) => {
    decoderError += chunk;
  });
  generator.stderr?.on("data", (chunk: string) => {
    generatorError += chunk;
  });
  generator.stdin?.on("error", () => undefined);
  decoder.stdout?.pipe(generator.stdin!);

  const timeout = setTimeout(() => {
    decoder.kill();
    generator.kill();
  }, commandTimeoutMs);

  try {
    await Promise.all([
      waitForChild(decoder, "ffmpeg", () => decoderError),
      waitForChild(generator, "audiowaveform", () => generatorError),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadObject(bucket: string, key: string, destination: string) {
  const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body || typeof (object.Body as { pipe?: unknown }).pipe !== "function") {
    throw new Error("R2 returned an invalid audio stream");
  }
  await pipeline(object.Body as NodeJS.ReadableStream, createWriteStream(destination));
}

async function uploadFile(
  bucket: string,
  key: string,
  filename: string,
  contentType: string,
) {
  const file = await stat(filename);
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filename),
      ContentLength: file.size,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return file.size;
}

async function claimJob() {
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE media_processing_job
       SET status = 'RUNNING',
           "lockedAt" = NOW(),
           "lockedBy" = ${workerId},
           attempts = attempts + 1,
           "updatedAt" = NOW()
     WHERE id = (
       SELECT id
         FROM media_processing_job
        WHERE status = 'QUEUED'
          AND "availableAt" <= NOW()
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING id
  `);

  if (!claimed[0]) return null;
  return prisma.mediaProcessingJob.findUnique({
    where: { id: claimed[0].id },
    include: {
      audioAsset: {
        include: {
          audioTrack: { select: { id: true, title: true } },
        },
      },
    },
  });
}

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "stream-media-"));
  const sourcePath = path.join(temporaryDirectory, "source-audio");
  const detailPath = path.join(temporaryDirectory, "detail.dat");
  const overviewPath = path.join(temporaryDirectory, "overview.json");
  const asset = job.audioAsset;
  const detailKey = `waveforms/${asset.ownerId}/${asset.id}/v${waveformVersion}/detail.dat`;
  const overviewKey = `waveforms/${asset.ownerId}/${asset.id}/v${waveformVersion}/overview.json`;

  console.log(`Processing ${asset.audioTrack?.title ?? asset.originalFilename}`);

  try {
    await prisma.audioAnalysis.update({
      where: { audioAssetId: asset.id },
      data: {
        status: AudioAnalysisStatus.PROCESSING,
        startedAt: new Date(),
        completedAt: null,
      },
    });

    await downloadObject(asset.bucket, asset.storageKey, sourcePath);
    const probeText = await runCommand(
      binaries.ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,bit_rate,duration:format=duration,bit_rate",
        "-of",
        "json",
        sourcePath,
      ],
      "ffprobe",
    );
    const probe = JSON.parse(probeText) as ProbeOutput;
    const stream = probe.streams?.[0];
    if (!stream) throw new Error("The uploaded file has no readable audio stream");

    const durationSeconds =
      parsePositiveNumber(stream.duration) ??
      parsePositiveNumber(probe.format?.duration);
    if (!durationSeconds) throw new Error("FFprobe returned an invalid duration");

    await generateDetailWaveform(sourcePath, detailPath);
    await runCommand(
      binaries.audiowaveform,
      [
        "--input-filename",
        detailPath,
        "--output-filename",
        overviewPath,
        "--output-format",
        "json",
        "--pixels-per-second",
        String(overviewPixelsPerSecond),
        "--bits",
        String(waveformBits),
        "--quiet",
      ],
      "audiowaveform overview",
    );

    const overview = JSON.parse(await readFile(overviewPath, "utf8")) as WaveformJson;
    if (
      overview.bits !== waveformBits ||
      overview.channels !== 1 ||
      overview.length <= 0 ||
      overview.data.length !== overview.length * 2
    ) {
      throw new Error("audiowaveform produced invalid overview data");
    }

    const [detailSize, overviewSize] = await Promise.all([
      uploadFile(asset.bucket, detailKey, detailPath, "application/octet-stream"),
      uploadFile(asset.bucket, overviewKey, overviewPath, "application/json"),
    ]);

    await prisma.$transaction(async (transaction) => {
      const detailAsset = await transaction.mediaAsset.upsert({
        where: { storageKey: detailKey },
        create: {
          ownerId: asset.ownerId,
          kind: MediaKind.WAVEFORM,
          status: MediaStatus.ATTACHED,
          bucket: asset.bucket,
          storageKey: detailKey,
          originalFilename: `${asset.audioTrack?.id ?? asset.id}-detail.dat`,
          mimeType: "application/octet-stream",
          byteSize: BigInt(detailSize),
          uploadedAt: new Date(),
          attachedAt: new Date(),
        },
        update: {
          status: MediaStatus.ATTACHED,
          byteSize: BigInt(detailSize),
          mimeType: "application/octet-stream",
          uploadedAt: new Date(),
          attachedAt: new Date(),
          expiresAt: null,
        },
      });
      const overviewAsset = await transaction.mediaAsset.upsert({
        where: { storageKey: overviewKey },
        create: {
          ownerId: asset.ownerId,
          kind: MediaKind.WAVEFORM,
          status: MediaStatus.ATTACHED,
          bucket: asset.bucket,
          storageKey: overviewKey,
          originalFilename: `${asset.audioTrack?.id ?? asset.id}-overview.json`,
          mimeType: "application/json",
          byteSize: BigInt(overviewSize),
          uploadedAt: new Date(),
          attachedAt: new Date(),
        },
        update: {
          status: MediaStatus.ATTACHED,
          byteSize: BigInt(overviewSize),
          mimeType: "application/json",
          uploadedAt: new Date(),
          attachedAt: new Date(),
          expiresAt: null,
        },
      });

      await transaction.audioAnalysis.update({
        where: { audioAssetId: asset.id },
        data: {
          status: AudioAnalysisStatus.READY,
          durationMs: Math.round(durationSeconds * 1_000),
          sampleRate: Math.round(parsePositiveNumber(stream.sample_rate) ?? processingSampleRate),
          channels: stream.channels ?? 1,
          codec: stream.codec_name,
          bitRate: parseBigInt(stream.bit_rate) ?? parseBigInt(probe.format?.bit_rate),
          waveformVersion,
          detailPixelsPerSecond,
          overviewPixelsPerSecond,
          waveformBits,
          detailWaveformAssetId: detailAsset.id,
          overviewWaveformAssetId: overviewAsset.id,
          completedAt: new Date(),
        },
      });
      await transaction.mediaProcessingJob.update({
        where: { id: job.id },
        data: {
          status: MediaProcessingJobStatus.SUCCEEDED,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          finishedAt: new Date(),
        },
      });
    });

    console.log(
      `Processed ${asset.audioTrack?.title ?? asset.originalFilename}: ${durationSeconds.toFixed(3)}s, ${overview.length} overview peaks`,
    );
  } catch (error) {
    const reason = errorMessage(error);
    const shouldRetry = job.attempts < job.maxAttempts;
    const retryDelayMs = Math.min(60_000, 2 ** job.attempts * 2_000);
    console.error(`Processing failed for ${asset.originalFilename}: ${reason}`);

    await prisma.$transaction([
      prisma.mediaProcessingError.create({
        data: {
          assetId: asset.id,
          trackId: asset.audioTrack?.id,
          requestId: job.id,
          operation: "AUDIO_ANALYSIS",
          reason,
        },
      }),
      prisma.audioAnalysis.update({
        where: { audioAssetId: asset.id },
        data: {
          status: shouldRetry
            ? AudioAnalysisStatus.QUEUED
            : AudioAnalysisStatus.FAILED,
        },
      }),
      prisma.mediaProcessingJob.update({
        where: { id: job.id },
        data: {
          status: shouldRetry
            ? MediaProcessingJobStatus.QUEUED
            : MediaProcessingJobStatus.FAILED,
          availableAt: new Date(Date.now() + retryDelayMs),
          lockedAt: null,
          lockedBy: null,
          lastError: reason,
          finishedAt: shouldRetry ? null : new Date(),
        },
      }),
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function backfillMissingJobs() {
  const tracks = await prisma.track.findMany({ select: { audioAssetId: true } });
  if (!tracks.length) return;

  const assetIds = tracks.map((track) => track.audioAssetId);
  const analyses = await prisma.audioAnalysis.findMany({
    where: { audioAssetId: { in: assetIds } },
    select: { audioAssetId: true },
  });
  const analyzedAssets = new Set(analyses.map((analysis) => analysis.audioAssetId));
  const missing = assetIds.filter((assetId) => !analyzedAssets.has(assetId));

  for (const audioAssetId of missing) {
    await prisma.$transaction([
      prisma.audioAnalysis.create({
        data: { audioAssetId, status: AudioAnalysisStatus.QUEUED },
      }),
      prisma.mediaProcessingJob.create({
        data: { audioAssetId, status: MediaProcessingJobStatus.QUEUED },
      }),
    ]);
  }
  if (missing.length) console.log(`Queued ${missing.length} existing tracks for analysis`);
}

async function workerLoop(slot: number) {
  while (!stopping) {
    const job = await claimJob();
    if (!job) {
      await delay(pollIntervalMs);
      continue;
    }

    console.log(`Worker slot ${slot} claimed job ${job.id}`);
    await processJob(job);
  }
}

async function main() {
  console.log(`Media worker ${workerId} starting with concurrency ${concurrency}`);
  await Promise.all([
    runCommand(binaries.ffmpeg, ["-version"], "ffmpeg preflight"),
    runCommand(binaries.ffprobe, ["-version"], "ffprobe preflight"),
    runCommand(binaries.audiowaveform, ["--version"], "audiowaveform preflight"),
  ]);

  const staleBefore = new Date(Date.now() - staleLockMs);
  const recovered = await prisma.mediaProcessingJob.updateMany({
    where: {
      status: MediaProcessingJobStatus.RUNNING,
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: MediaProcessingJobStatus.QUEUED,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (recovered.count) console.log(`Recovered ${recovered.count} stale jobs`);

  await backfillMissingJobs();
  await Promise.all(
    Array.from({ length: concurrency }, (_, index) => workerLoop(index + 1)),
  );
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Media worker received ${signal}; finishing active jobs`);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main()
  .catch((error) => {
    console.error("Media worker failed to start", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
