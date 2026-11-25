"use client";

import { useEffect, useState } from "react";

import {
  parseAudiowaveformJson,
  type WaveformPeak,
} from "@/lib/waveform-utils";

interface WaveformResult {
  /** The waveform URL this result belongs to. */
  url: string;
  peaks: WaveformPeak[];
  error: string | null;
}

export function useTrackWaveform(
  waveformUrl: string | null | undefined,
  processingFailed = false,
) {
  // Results are keyed by URL so a stale result is ignored when the URL changes,
  // without resetting state synchronously inside the effect.
  const [result, setResult] = useState<WaveformResult | null>(null);

  useEffect(() => {
    if (!waveformUrl || processingFailed) return;

    let canceled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(waveformUrl, {
          signal: controller.signal,
        });
        if (response.status === 202) {
          if (!canceled) retryTimer = setTimeout(() => void load(), 3_000);
          return;
        }
        if (!response.ok) {
          throw new Error(`Waveform request returned ${response.status}`);
        }

        const parsed = parseAudiowaveformJson(await response.json());
        if (!parsed.length) throw new Error("Waveform response was malformed");
        if (!canceled) {
          setResult({ url: waveformUrl, peaks: parsed, error: null });
        }
      } catch (loadError) {
        if (canceled || controller.signal.aborted) return;
        setResult({
          url: waveformUrl,
          peaks: [],
          error:
            loadError instanceof Error ? loadError.message : String(loadError),
        });
      }
    };

    void load();
    return () => {
      canceled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [processingFailed, waveformUrl]);

  const current = result?.url === waveformUrl ? result : null;
  return {
    peaks: current?.peaks ?? [],
    isLoading: Boolean(waveformUrl) && !processingFailed && !current,
    error: current?.error ?? null,
  };
}
