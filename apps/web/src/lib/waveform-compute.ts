/** Overview resolution; must match what the waveform renderer/reader expects. */
export const OVERVIEW_PIXELS_PER_SECOND = 20;

export interface ComputedWaveform {
  durationMs: number;
  sampleRate: number;
  channels: number;
  /** Interleaved [min, max, min, max, ...] as signed 8-bit values (-128..127). */
  peaks: number[];
}

const toInt8 = (value: number) =>
  Math.max(-128, Math.min(127, Math.round(value * 128)));

/**
 * Reduce decoded PCM to min/max pairs, one pair per 1/OVERVIEW_PIXELS_PER_SECOND
 * seconds. Channels are folded together (lowest min, highest max) so the result
 * is a mono envelope like BBC audiowaveform produces.
 */
export function computePeaks(
  channelData: Float32Array[],
  sampleRate: number,
  pixelsPerSecond = OVERVIEW_PIXELS_PER_SECOND,
): ComputedWaveform {
  const first = channelData[0];
  if (!first || first.length === 0 || sampleRate <= 0) {
    throw new Error("Audio contains no samples");
  }

  const totalSamples = first.length;
  const samplesPerPixel = sampleRate / pixelsPerSecond;
  const pixelCount = Math.max(1, Math.ceil(totalSamples / samplesPerPixel));
  const peaks = new Array<number>(pixelCount * 2);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const start = Math.floor(pixel * samplesPerPixel);
    const end = Math.min(totalSamples, Math.floor((pixel + 1) * samplesPerPixel));
    let min = 0;
    let max = 0;
    for (const channel of channelData) {
      for (let i = start; i < end; i++) {
        const sample = channel[i] ?? 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }
    peaks[pixel * 2] = toInt8(min);
    peaks[pixel * 2 + 1] = toInt8(max);
  }

  return {
    durationMs: Math.round((totalSamples / sampleRate) * 1000),
    sampleRate,
    channels: channelData.length,
    peaks,
  };
}

/** Same document shape audiowaveform emits (`--bits 8`, mono). */
export function buildAudiowaveformDocument(
  peaks: number[],
  sampleRate: number,
  pixelsPerSecond = OVERVIEW_PIXELS_PER_SECOND,
) {
  return {
    version: 2,
    channels: 1,
    sample_rate: sampleRate,
    samples_per_pixel: Math.round(sampleRate / pixelsPerSecond),
    bits: 8 as const,
    length: peaks.length / 2,
    data: peaks,
  };
}
