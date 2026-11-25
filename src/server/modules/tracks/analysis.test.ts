import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePeaks } from "@/lib/waveform-compute";
import { parseAudiowaveformJson } from "@/lib/waveform-utils";
import {
  clientAnalysisSchema,
  serializeWaveform,
  waveformStorageKey,
} from "./analysis";

function sine(seconds: number, sampleRate = 8_000, amplitude = 0.5) {
  const out = new Float32Array(seconds * sampleRate);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude;
  }
  return out;
}

describe("computePeaks", () => {
  it("emits 20 min/max pairs per second and the real duration", () => {
    const result = computePeaks([sine(3)], 8_000);
    assert.equal(result.durationMs, 3000);
    assert.equal(result.peaks.length, 3 * 20 * 2);
    assert.equal(result.channels, 1);
  });

  it("scales to signed 8 bit and folds channels", () => {
    const left = new Float32Array(8_000).fill(0.5);
    const right = new Float32Array(8_000).fill(-1);
    const { peaks } = computePeaks([left, right], 8_000);
    assert.equal(peaks[0], -128);
    assert.equal(peaks[1], 64);
  });

  it("rejects empty audio", () => {
    assert.throws(() => computePeaks([new Float32Array(0)], 44_100));
  });
});

describe("clientAnalysisSchema", () => {
  const valid = computePeaks([sine(2)], 8_000);

  it("accepts computed analysis and round-trips through the reader", () => {
    const parsed = clientAnalysisSchema.parse(valid);
    const peaks = parseAudiowaveformJson(JSON.parse(serializeWaveform(parsed)));
    assert.equal(peaks.length, 40);
    assert.ok(peaks[5]!.max > 0.4 && peaks[5]!.max <= 0.5);
  });

  it("rejects peak counts that disagree with the duration", () => {
    assert.equal(
      clientAnalysisSchema.safeParse({ ...valid, durationMs: 60_000 }).success,
      false,
    );
  });

  it("rejects out-of-range or odd-length peaks", () => {
    assert.equal(
      clientAnalysisSchema.safeParse({ ...valid, peaks: [...valid.peaks.slice(0, -1)] }).success,
      false,
    );
    assert.equal(
      clientAnalysisSchema.safeParse({ ...valid, peaks: valid.peaks.map(() => 999) }).success,
      false,
    );
  });
});

describe("waveformStorageKey", () => {
  it("is namespaced by owner and asset", () => {
    assert.equal(waveformStorageKey("u", "a"), "waveforms/u/a/v1/overview.json");
  });
});
