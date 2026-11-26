import assert from "node:assert/strict";
import test from "node:test";

import { defaultPreviewStartMs, normalizeIsrc, scheduleProblem, titleFromFilename, trackFieldsSchema } from "./track-fields";

test("UP-9: titles come from file names without extension, separators or track numbers", () => {
  assert.equal(titleFromFilename("01 - Gitarda_Bir_Riff_4.mp3"), "Gitarda Bir Riff 4");
  assert.equal(titleFromFilename("07. Night Drive.WAV"), "Night Drive");
  assert.equal(titleFromFilename("2 - Piano 6.mp3"), "Piano 6");
  assert.equal(titleFromFilename("Artist - Song.flac"), "Artist - Song");
  assert.equal(titleFromFilename(".mp3"), "Untitled");
});

test("7.3: ISRC accepts hyphens and lowercase, rejects bad shapes", () => {
  assert.equal(normalizeIsrc("us-abc-24-12345"), "USABC2412345");
  assert.equal(normalizeIsrc("USABC2412345"), "USABC2412345");
  assert.equal(normalizeIsrc("US-AB-24-12345"), null);
  assert.equal(normalizeIsrc("USABC24123"), null);
});

test("7.3: preview starts at 0 for short tracks and 25 % in otherwise, always with 30 s left", () => {
  assert.equal(defaultPreviewStartMs(35_000), 0);
  assert.equal(defaultPreviewStartMs(200_000), 50_000);
  assert.equal(defaultPreviewStartMs(61_000), 15_250);
  assert.equal(defaultPreviewStartMs(100_000) + 30_000 <= 100_000, true);
});

test("7.3: schedules need 5 minutes to 1 year ahead", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  assert.ok(scheduleProblem(new Date(now.getTime() + 60_000), now));
  assert.equal(scheduleProblem(new Date(now.getTime() + 10 * 60_000), now), null);
  assert.ok(scheduleProblem(new Date(now.getTime() + 400 * 86_400_000), now));
});

test("7.3 field rules: lengths, BPM, buy link, slug shape", () => {
  const ok = trackFieldsSchema.safeParse({ title: "A", bpm: 120, buyUrl: "https://shop.example/x", slug: "a-b" });
  assert.equal(ok.success, true);
  for (const bad of [{ title: "" }, { title: "x".repeat(101) }, { title: "A", bpm: 10 }, { title: "A", bpm: 301 }, { title: "A", buyUrl: "http://x.example" }, { title: "A", slug: "Not Ok" }, { title: "A", isrc: "nope" }, { title: "A", musicalKey: "H major" }]) {
    assert.equal(trackFieldsSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
  assert.equal(trackFieldsSchema.parse({ title: "A", buyUrl: "" }).buyUrl, null);
});
