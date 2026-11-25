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

/**
 * Reduce a waveform to the available display columns without averaging away
 * transients. Every output column keeps the lowest minimum and highest maximum
 * from its source interval.
 */
export function reduceWaveformPeaks(
  peaks: WaveformPeak[],
  targetLength: number,
): WaveformPeak[] {
  const safeTarget = Math.max(1, Math.floor(targetLength));
  if (peaks.length <= safeTarget) return peaks;

  const result = new Array<WaveformPeak>(safeTarget);
  for (let index = 0; index < safeTarget; index++) {
    const start = Math.floor((index * peaks.length) / safeTarget);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * peaks.length) / safeTarget),
    );
    let min = 1;
    let max = -1;

    for (let sourceIndex = start; sourceIndex < end; sourceIndex++) {
      const peak = peaks[sourceIndex];
      if (!peak) continue;
      if (peak.min < min) min = peak.min;
      if (peak.max > max) max = peak.max;
    }
    result[index] = { min, max };
  }

  return result;
}

/** Compatibility adapter for older experimental visualizers. */
export function processWaveformData(value: unknown): number[] {
  return parseAudiowaveformJson(value).map((peak) =>
    Math.max(Math.abs(peak.min), Math.abs(peak.max)),
  );
}
