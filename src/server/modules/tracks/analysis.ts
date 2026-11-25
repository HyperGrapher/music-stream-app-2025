import { z } from "zod";

import {
  buildAudiowaveformDocument,
  OVERVIEW_PIXELS_PER_SECOND,
} from "@/lib/waveform-compute";

const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const MAX_PIXELS = (MAX_DURATION_MS / 1000) * OVERVIEW_PIXELS_PER_SECOND;

/** Waveform data computed in the browser and submitted when an upload completes. */
export const clientAnalysisSchema = z
  .object({
    durationMs: z.number().int().positive().max(MAX_DURATION_MS),
    sampleRate: z.number().int().min(8_000).max(384_000),
    channels: z.number().int().min(1).max(32),
    peaks: z
      .array(z.number().int().min(-128).max(127))
      .min(2)
      .max(MAX_PIXELS * 2)
      .refine((p) => p.length % 2 === 0, "peaks must be min/max pairs"),
  })
  .refine(
    ({ peaks, durationMs }) =>
      Math.abs(peaks.length / 2 - (durationMs / 1000) * OVERVIEW_PIXELS_PER_SECOND) <= 2,
    "peak count does not match duration",
  );

export type ClientAnalysis = z.infer<typeof clientAnalysisSchema>;

export function waveformStorageKey(userId: string, audioAssetId: string) {
  return `waveforms/${userId}/${audioAssetId}/v1/overview.json`;
}

export function serializeWaveform(analysis: ClientAnalysis) {
  return JSON.stringify(
    buildAudiowaveformDocument(analysis.peaks, analysis.sampleRate),
  );
}
