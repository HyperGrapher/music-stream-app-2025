import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAudiowaveformJson,
  buildWaveformBars,
  type WaveformPeak,
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

const flat = (amplitude: number): WaveformPeak => ({
  min: -amplitude,
  max: amplitude,
});

test("bar count follows the display, not the track length", () => {
  const short = Array.from({ length: 700 }, () => flat(0.5));
  const long = Array.from({ length: 12_000 }, () => flat(0.5));
  assert.equal(buildWaveformBars(short, 260).length, 260);
  assert.equal(buildWaveformBars(long, 260).length, 260);
  assert.deepEqual(buildWaveformBars([], 260), []);
});

test("a loud track keeps its quiet passages visible", () => {
  // Mastered music: every bar contains a near-full-scale transient, but the
  // middle section is mostly quiet. Taking the maximum would flatten this.
  const source: WaveformPeak[] = [];
  for (let bar = 0; bar < 30; bar++) {
    const quiet = bar >= 10 && bar < 20;
    for (let window = 0; window < 14; window++) {
      source.push(flat(window === 0 ? 0.98 : quiet ? 0.2 : 0.8));
    }
  }
  const bars = buildWaveformBars(source, 30);
  const loud = bars[0] ?? 0;
  const soft = bars[15] ?? 0;
  assert.ok(loud > 0.95, `loud bar is ${loud}`);
  assert.ok(soft < 0.5, `quiet bar is ${soft}`);
});

test("uses the larger of both polarities and never exceeds 1", () => {
  const bars = buildWaveformBars(
    [
      { min: -0.8, max: 0.1 },
      { min: -0.1, max: 0.4 },
    ],
    2,
  );
  assert.deepEqual(bars, [1, 0.5]);
});

test("short tracks are interpolated up to the bar count", () => {
  const bars = buildWaveformBars([flat(0), flat(1)], 4);
  assert.equal(bars.length, 4);
  assert.equal(bars[0], 0);
  assert.equal(bars[3], 1);
  assert.ok((bars[1] ?? 0) < (bars[2] ?? 0));
});

test("near-silence is not amplified to full height", () => {
  const bars = buildWaveformBars([flat(0.004), flat(0.002)], 2);
  assert.ok(bars.every((bar) => bar <= 0.1));
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
