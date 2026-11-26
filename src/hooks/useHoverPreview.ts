"use client";

import { useCallback, useEffect, useRef } from "react";

import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

const DELAY_MS = 600;
const CLIP_MS = 30_000;
const VOLUME = 0.35;

let shared: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

function stopPreview() {
  clearTimeout(stopTimer);
  if (shared) {
    shared.pause();
    shared.removeAttribute("src");
    shared.load();
  }
}

/**
 * DI-4 Quick preview: resting the mouse on a card for a moment plays its 30 s preview clip (from `previewStartMs`) at
 * reduced volume, without touching the queue; leaving stops it. Only for a real mouse, never while the main player is
 * playing, and never counted as a play (nothing is reported).
 */
export function useHoverPreview(track: Pick<PlayerTrack, "streamUrl" | "previewStartMs">) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { streamUrl, previewStartMs } = track;

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    stopPreview();
  }, []);
  useEffect(() => stop, [stop]);

  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse" || !streamUrl) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (usePlayerStore.getState().status === "playing") return;
        shared ??= new Audio();
        stopPreview();
        shared.volume = VOLUME;
        shared.src = streamUrl;
        const start = (previewStartMs ?? 0) / 1000;
        shared.addEventListener("loadedmetadata", () => { if (shared) shared.currentTime = start; }, { once: true });
        void shared.play().catch(() => undefined);
        stopTimer = setTimeout(stopPreview, CLIP_MS);
      }, DELAY_MS);
    },
    [streamUrl, previewStartMs],
  );

  return { onPointerEnter, onPointerLeave: stop };
}
