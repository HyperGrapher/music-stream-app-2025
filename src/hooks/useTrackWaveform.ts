"use client";

import { useEffect, useState } from "react";

import {
  parseAudiowaveformJson,
  type WaveformPeak,
} from "@/lib/waveform-utils";

export function useTrackWaveform(
  waveformUrl: string | null | undefined,
  processingFailed = false,
) {
  const [peaks, setPeaks] = useState<WaveformPeak[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(waveformUrl));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPeaks([]);
    setError(null);
    setIsLoading(Boolean(waveformUrl) && !processingFailed);
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
          setPeaks(parsed);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (canceled || controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
        setIsLoading(false);
      }
    };

    void load();
    return () => {
      canceled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [processingFailed, waveformUrl]);

  return { peaks, isLoading, error };
}
