import { computePeaks, type ComputedWaveform } from "./waveform-compute";

/**
 * Decode an audio file in the browser and compute duration + waveform peaks.
 * Replaces the server-side FFmpeg/audiowaveform worker for new uploads.
 * Throws if the browser cannot decode the format; callers should degrade
 * gracefully (the track just has no waveform).
 */
export async function analyzeAudioFile(file: File): Promise<ComputedWaveform> {
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Web Audio is not supported");

  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
      buffer.getChannelData(i),
    );
    return computePeaks(channels, buffer.sampleRate);
  } finally {
    void context.close();
  }
}
