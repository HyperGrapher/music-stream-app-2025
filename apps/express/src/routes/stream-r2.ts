import express, { type Response, type Router } from "express";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

import {
  calculateStreamHeaders,
  logStreamError,
  RangeNotSatisfiableError,
} from "../helpers/stream-utils";
import { r2Client } from "../lib/r2-client";
import { prisma } from "../lib/prisma";
import { validatePlaybackToken } from "../middlewares/validate-playback-token";

const router: Router = express.Router();
const TRACK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTrackId(value: string | undefined): value is string {
  return typeof value === "string" && TRACK_ID_PATTERN.test(value);
}

function endStreamWithError(res: Response, status: number, message: string) {
  if (!res.headersSent) {
    res.status(status).json({ error: message });
    return;
  }

  res.destroy();
}

router.get("/stream/:trackId", async (req, res) => {
  const requestedTrackId = req.params.trackId;
  const range = req.headers.range;

  if (!isTrackId(requestedTrackId)) {
    return res.status(404).json({ error: "Track not found" });
  }

  if (!range) {
    return res
      .status(400)
      .set("Accept-Ranges", "bytes")
      .json({ error: "Range header is required" });
  }

  const requestId = randomUUID();

  try {
    const track = await prisma.track.findFirst({
      where: {
        id: requestedTrackId,
        visibility: "PUBLIC",
      },
      select: {
        audioAsset: { select: { storageKey: true, bucket: true } },
      },
    });

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    const bucket = track.audioAsset.bucket;

    const objectMetadata = await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: track.audioAsset.storageKey,
      }),
    );
    const fileSize = objectMetadata.ContentLength;

    if (!fileSize) {
      throw new Error("Storage returned an invalid content length");
    }

    let streamDetails;
    try {
      streamDetails = calculateStreamHeaders(fileSize, range);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableError) {
        return res
          .status(416)
          .set("Content-Range", `bytes */${fileSize}`)
          .set("Accept-Ranges", "bytes")
          .json({ error: "Requested range is not satisfiable" });
      }
      throw error;
    }

    const { headers, start, end } = streamDetails;
    headers["Content-Type"] = objectMetadata.ContentType ?? "audio/mpeg";

    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: track.audioAsset.storageKey,
        Range: `bytes=${start}-${end}`,
      }),
    );

    if (
      !object.Body ||
      typeof (object.Body as { pipe?: unknown }).pipe !== "function"
    ) {
      throw new Error("Storage returned an invalid stream");
    }

    const audioStream = object.Body as Readable;
    let streamFinished = false;

    audioStream.once("end", () => {
      streamFinished = true;
    });
    audioStream.once("error", (error) => {
      console.error(
        `Stream ${requestId} failed for track ${requestedTrackId}`,
        error,
      );
      void logStreamError(requestedTrackId, requestId, error);
      endStreamWithError(res, 502, "Unable to stream track");
    });
    res.once("close", () => {
      if (!streamFinished && !audioStream.destroyed) {
        audioStream.destroy();
      }
    });

    res.writeHead(206, headers);
    audioStream.pipe(res);
  } catch (error) {
    const streamError =
      error instanceof Error ? error : new Error("Unknown streaming error");
    console.error(
      `Stream ${requestId} failed for track ${requestedTrackId}`,
      streamError,
    );
    void logStreamError(requestedTrackId, requestId, streamError);
    return endStreamWithError(res, 502, "Unable to stream track");
  }
});

router.get(
  "/stream/:trackId/waveform",
  validatePlaybackToken,
  async (req, res) => {
    const requestedTrackId = req.params.trackId;
    if (!isTrackId(requestedTrackId)) {
      return res.status(404).json({ error: "Track not found" });
    }

    const waveformPath = path.resolve(
      __dirname,
      "..",
      "..",
      "audio",
      `${requestedTrackId}.json`,
    );

    if (!fs.existsSync(waveformPath)) {
      return res.status(404).json({ error: "Waveform file not found" });
    }

    const waveformData = JSON.parse(fs.readFileSync(waveformPath, "utf8"));
    return res.json(waveformData);
  },
);

router.get("/:trackId", async (req, res) => {
  const requestedTrackId = req.params.trackId;
  if (!isTrackId(requestedTrackId)) {
    return res.status(404).json({ error: "Track not found" });
  }

  const track = await prisma.track.findFirst({
    where: {
      id: requestedTrackId,
      visibility: "PUBLIC",
    },
    select: {
      id: true,
      title: true,
      duration: true,
      artworkAsset: { select: { publicUrl: true } },
      waveformData: true,
    },
  });

  if (!track) {
    return res.status(404).json({ error: "Track not found" });
  }

  const { artworkAsset, ...trackData } = track;
  return res.json({
    track: { ...trackData, artworkUrl: artworkAsset?.publicUrl ?? null },
  });
});

export default router;
