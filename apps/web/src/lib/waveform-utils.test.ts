import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAudiowaveformJson,
  reduceWaveformPeaks,
} from "./waveform-utils";

test("parses audiowaveform min/max pairs without flattening them", () => {
  const peaks = parseAudiowaveformJson({
    version: 2,
    channels: 1,
    sample_rate: 44_100,
    samples_per_pixel: 441,
    bits: 8,
    length: 3,
    data: [-128, 127, -64, 32, -8, 4],
  });

  assert.deepEqual(peaks, [
    { min: -1, max: 127 / 128 },
    { min: -0.5, max: 0.25 },
    { min: -0.0625, max: 0.03125 },
  ]);
});

test("downsampling preserves interval extrema instead of averaging transients", () => {
  const reduced = reduceWaveformPeaks(
    [
      { min: -0.1, max: 0.1 },
      { min: -1, max: 0.95 },
      { min: -0.2, max: 0.15 },
      { min: -0.3, max: 0.4 },
    ],
    2,
  );

  assert.deepEqual(reduced, [
    { min: -1, max: 0.95 },
    { min: -0.3, max: 0.4 },
  ]);
});

test("rejects malformed or multi-channel payloads", () => {
  assert.deepEqual(parseAudiowaveformJson(null), []);
  assert.deepEqual(
    parseAudiowaveformJson({
      version: 2,
      channels: 2,
      sample_rate: 44_100,
      samples_per_pixel: 441,
      bits: 8,
      length: 1,
      data: [-1, 1, -1, 1],
    }),
    [],
  );
});
