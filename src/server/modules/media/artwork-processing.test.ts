import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { InvalidArtworkError, renderArtworkRenditions } from "./artwork-processing";

const image = (width: number, height: number, format: "jpeg" | "png" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .toFormat(format)
    .toBuffer();

test("a large landscape image becomes square WebP renditions, none larger than 640 px", async () => {
  const renditions = await renderArtworkRenditions(await image(3000, 2000));
  assert.deepEqual(renditions.map((r) => r.width), [96, 320, 640]);
  for (const r of renditions) {
    const meta = await sharp(r.data).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, r.width);
    assert.equal(meta.height, r.width);
    assert.equal(meta.exif, undefined);
  }
});

test("small and portrait images are cropped but never upscaled", async () => {
  const portrait = await renderArtworkRenditions(await image(462, 1024, "png"));
  assert.deepEqual(portrait.map((r) => r.width), [96, 320, 462]);
  const tiny = await renderArtworkRenditions(await image(150, 200));
  assert.deepEqual(tiny.map((r) => r.width), [96, 150]);
  const meta = await sharp(tiny.at(-1)!.data).metadata();
  assert.deepEqual([meta.width, meta.height], [150, 150]);
});

test("EXIF orientation is applied before cropping", async () => {
  // Stored 400x200 but tagged "rotate 90": displayed as 200x400, so the left half of the
  // displayed image is the stored top half. Fill the stored top red, bottom blue.
  const stored = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#0000ff" } })
    .composite([{ input: { create: { width: 400, height: 100, channels: 3, background: "#ff0000" } }, top: 0, left: 0 }])
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const [smallest] = await renderArtworkRenditions(stored);
  const { data, info } = await sharp(smallest!.data).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  // After rotating 90 deg clockwise the stored top (red) is on the right.
  assert.ok(pixel(info.width - 5, info.height / 2)[0]! > 200, "right side is red");
  assert.ok(pixel(5, info.height / 2)[2]! > 200, "left side is blue");
});

test("files that are not images, or are absurdly large, are refused", async () => {
  await assert.rejects(renderArtworkRenditions(Buffer.from("not an image")), InvalidArtworkError);
  const truncated = (await image(800, 800)).subarray(0, 300);
  await assert.rejects(renderArtworkRenditions(truncated), InvalidArtworkError);
  const huge = await sharp({ create: { width: 10000, height: 6000, channels: 3, background: "#000" } }).png({ compressionLevel: 1 }).toBuffer();
  await assert.rejects(renderArtworkRenditions(huge), InvalidArtworkError);
});
