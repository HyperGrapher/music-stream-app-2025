"use client";

import { useCallback } from "react";

import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

/** Jump to a moment of a track: load it first if it is not the current one, then seek and play. */
export function usePlayAt(track: PlayerTrack) {
  return useCallback(
    (seconds: number) => {
      const state = usePlayerStore.getState();
      if (state.currentTrack?.id !== track.id) {
        state.setPlaylist([track]);
        state.playTrack(track);
        state.seek(seconds); // while loading, the seek is applied once the media is ready
        return;
      }
      state.seek(seconds);
      if (state.status !== "playing" && state.status !== "loading") state.play();
    },
    [track],
  );
}
