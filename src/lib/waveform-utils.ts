export interface WaveformPeak {
  min: number;
  max: number;
}

export interface AudiowaveformJson {
  version: number;
  channels: number;
  sample_rate: number;
  samples_per_pixel: number;
  bits: 8 | 16;
  length: number;
  data: number[];
}

function isAudiowaveformJson(value: unknown): value is AudiowaveformJson {
  if (!value || typeof value !== "object") return false;
  const waveform = value as Partial<AudiowaveformJson>;
  return (
    (waveform.bits === 8 || waveform.bits === 16) &&
    waveform.channels === 1 &&
    typeof waveform.length === "number" &&
    waveform.length > 0 &&
    Array.isArray(waveform.data) &&
    waveform.data.length === waveform.length * 2
  );
}

/** Parse the mono min/max pairs emitted by BBC audiowaveform. */
export function parseAudiowaveformJson(value: unknown): WaveformPeak[] {
  if (!isAudiowaveformJson(value)) return [];
  const scale = value.bits === 8 ? 128 : 32_768;
  const peaks = new Array<WaveformPeak>(value.length);

  for (let index = 0; index < value.length; index++) {
    const offset = index * 2;
    const min = value.data[offset];
    const max = value.data[offset + 1];
    peaks[index] = {
      min: Math.max(-1, Math.min(1, (min ?? 0) / scale)),
      max: Math.max(-1, Math.min(1, (max ?? 0) / scale)),
    };
  }

  return peaks;
}

/** Bars quieter than this fraction of full scale are not scaled up to fill the height. */
const MIN_NORMALIZATION_LEVEL = 0.04;
/** Bars are scaled so this percentile reaches full height (ignores a few outliers). */
const NORMALIZATION_PERCENTILE = 0.99;

/**
 * Turn the stored overview (one min/max pair per 50 ms) into `barCount` bar
 * heights between 0 and 1, SoundCloud style.
 *
 * Each bar is the RMS of the per-window peak amplitudes it covers, not their
 * maximum. Mastered music hits near full scale somewhere in almost every
 * second, so taking the maximum over a long track's bars (14+ windows each for
 * a 3-4 minute track) flattens it into a solid block. The RMS follows how loud
 * the passage actually is, so intros, breaks and drops stay visible, and the
 * bar count depends only on the display width, never on the track length.
 * Bars are then scaled so the 99th percentile fills the height.
 */
export function buildWaveformBars(
  peaks: WaveformPeak[],
  barCount: number,
): number[] {
  const count = Math.max(1, Math.floor(barCount));
  const sourceLength = peaks.length;
  if (!sourceLength) return [];

  const envelope = peaks.map((peak) => Math.max(0, -peak.min, peak.max));
  const bars = new Array<number>(count);

  if (sourceLength < count) {
    // Very short tracks: fewer windows than bars, interpolate between them.
    for (let index = 0; index < count; index++) {
      const position = Math.max(
        0,
        Math.min(
          sourceLength - 1,
          ((index + 0.5) * sourceLength) / count - 0.5,
        ),
      );
      const left = Math.floor(position);
      const right = Math.min(sourceLength - 1, left + 1);
      const weight = position - left;
      bars[index] =
        (envelope[left] ?? 0) * (1 - weight) + (envelope[right] ?? 0) * weight;
    }
  } else {
    for (let index = 0; index < count; index++) {
      const start = Math.floor((index * sourceLength) / count);
      const end = Math.max(
        start + 1,
        Math.floor(((index + 1) * sourceLength) / count),
      );
      let sumOfSquares = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex++) {
        const value = envelope[sourceIndex] ?? 0;
        sumOfSquares += value * value;
      }
      bars[index] = Math.sqrt(sumOfSquares / (end - start));
    }
  }

  const sorted = [...bars].sort((left, right) => left - right);
  const reference = Math.max(
    sorted[Math.round((sorted.length - 1) * NORMALIZATION_PERCENTILE)] ?? 0,
    MIN_NORMALIZATION_LEVEL,
  );
  return bars.map((value) => Math.min(1, value / reference));
}
