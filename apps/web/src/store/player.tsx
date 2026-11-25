"use client";

import { create } from "zustand";
import type { PlayerTrack as Track } from "@/types/player-track";
import { toast } from "sonner";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

// Defined playback states for clear control flow
type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

// A single interface for all state
interface PlayerState {
  // Core State
  status: PlaybackStatus;
  currentTrack: Track | null;
  playlist: Track[];
  volume: number; // 0 to 1
  isMuted: boolean;
  currentTime: number;
  duration: number;
  pendingSeekTime: number | null;

  // Actions
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  pause: () => void;
  play: () => void;
  seek: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaylist: (tracks: Track[]) => void;
}

// Create a persistent audio element outside of React lifecycle
let audioElement: HTMLAudioElement | null = null;

const clampVolume = (volume: number) => Math.max(0, Math.min(1, volume));

const getStoredVolume = (): number | null => {
  if (typeof window === "undefined") return null;

  try {
    const storedVolume = localStorage.getItem("playerVolume");
    if (storedVolume === null) return null;

    const parsedVolume = Number.parseFloat(storedVolume);
    return Number.isFinite(parsedVolume) ? clampVolume(parsedVolume) : null;
  } catch {
    return null;
  }
};

const isAbortError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "AbortError";

// Function to get/create the global audio element
const getAudioElement = (): HTMLAudioElement => {
  if (!audioElement && typeof window !== "undefined") {
    audioElement = new Audio();
    audioElement.preload = "auto";
    audioElement.volume = getStoredVolume() ?? 1;
  }
  return audioElement!;
};

const getTrackStreamUrl = (trackId: string) =>
  `/api/tracks/${encodeURIComponent(trackId)}/stream`;

// One play per playback start; the audio itself is served by R2 via redirect.
const recordPlay = (trackId: string) => {
  void fetch(`/api/tracks/${encodeURIComponent(trackId)}/play`, {
    method: "POST",
    keepalive: true,
  }).catch(() => undefined);
};

const isCurrentAudioSource = (audio: HTMLAudioElement) => {
  const currentTrack = usePlayerStore.getState().currentTrack;
  if (!currentTrack || typeof window === "undefined") return false;

  const expectedSource = new URL(
    getTrackStreamUrl(currentTrack.id),
    window.location.href,
  ).href;
  return audio.src === expectedSource;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  status: "idle",
  currentTrack: null,
  playlist: [],
  volume: 1,
  isMuted: false,
  currentTime: 0,
  duration: 0,
  pendingSeekTime: null,

  // Load and play a track
  playTrack: (track) => {
    const { currentTrack, status } = get();

    if (currentTrack?.id === track.id) {
      if (status === "loading" || status === "playing" || status === "paused") {
        get().togglePlay();
        return;
      }
    }

    const audio = getAudioElement();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    set({
      currentTrack: track,
      status: "loading",
      currentTime: 0,
      duration: 0,
      pendingSeekTime: null,
    });
  },

  // Toggle between play and pause
  togglePlay: () => {
    const { status, play, pause } = get();
    if (status === "playing" || status === "loading") {
      pause();
    } else {
      play();
    }
  },

  // Pause playback
  pause: () => {
    const audio = getAudioElement();
    audio.pause();
    set({ status: "paused" });
  },

  // Start or resume playback
  play: () => {
    const { currentTrack, status } = get();
    if (!currentTrack) return;

    // Already playing - do nothing
    if (status === "playing") return;

    const audio = getAudioElement();
    if (status === "paused" && audio.src && !audio.ended) {
      const requestedTrackId = currentTrack.id;
      audio.play().catch((error) => {
        if (
          isAbortError(error) ||
          get().currentTrack?.id !== requestedTrackId
        ) {
          return;
        }

        console.error("Error resuming playback:", error);
        if (get().status !== "error") {
          set({ status: "error" });
          toast.error("Failed to resume track");
        }
      });
      return;
    }

    set({ status: "loading" });
  },

  // Seek to specific time
  seek: (time) => {
    if (!Number.isFinite(time) || time < 0) return;

    const audio = getAudioElement();
    if (get().status === "loading") {
      set({ currentTime: time, pendingSeekTime: time });
      return;
    }

    const mediaDuration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : null;

    if (mediaDuration === null) {
      set({ currentTime: time, pendingSeekTime: time });
      return;
    }

    const targetTime = Math.min(time, mediaDuration);
    audio.currentTime = targetTime;
    set({ currentTime: targetTime, pendingSeekTime: null });
  },

  // Play next track in playlist
  nextTrack: () => {
    const { currentTrack, playlist, duration } = get();
    const audio = getAudioElement();

    if (!currentTrack || playlist.length === 0) {
      if (audio.ended) {
        set({ status: "paused", currentTime: duration });
      }
      return;
    }

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrack.id,
    );
    if (currentIndex < 0 || currentIndex >= playlist.length - 1) {
      if (audio.ended) {
        set({ status: "paused", currentTime: duration });
      }
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    set({
      currentTrack: playlist[currentIndex + 1]!,
      status: "loading",
      currentTime: 0,
      duration: 0,
      pendingSeekTime: null,
    });
  },

  // Play previous track in playlist
  previousTrack: () => {
    const { currentTrack, playlist, currentTime } = get();
    if (!currentTrack || playlist.length === 0) return;

    const currentIndex = playlist.findIndex(
      (track) => track.id === currentTrack.id,
    );
    if (currentTime > 3 || currentIndex <= 0) {
      get().seek(0);
      return;
    }

    const audio = getAudioElement();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    set({
      currentTrack: playlist[currentIndex - 1]!,
      status: "loading",
      currentTime: 0,
      duration: 0,
      pendingSeekTime: null,
    });
  },

  // Set volume and persist to local storage
  setVolume: (volume) => {
    if (!Number.isFinite(volume)) return;

    const audio = getAudioElement();
    const clampedVolume = clampVolume(volume);
    audio.volume = clampedVolume;
    audio.muted = clampedVolume === 0;

    try {
      localStorage.setItem("playerVolume", clampedVolume.toString());
    } catch {
      // Playback should still work when storage is unavailable.
    }

    set({
      volume: clampedVolume,
      isMuted: audio.muted,
    });
  },

  // Toggle mute state
  toggleMute: () => {
    const { isMuted, volume } = get();
    const audio = getAudioElement();

    if (isMuted) {
      if (volume === 0) {
        get().setVolume(0.5);
      } else {
        audio.muted = false;
        set({ isMuted: false });
      }
    } else {
      audio.muted = true;
      set({ isMuted: true });
    }
  },

  // Set playlist tracks
  setPlaylist: (tracks) => {
    set({ playlist: tracks });
  },
}));

// Hook to set up audio events
export function useAudioEvents() {
  const nextTrack = usePlayerStore((state) => state.nextTrack);

  useEffect(() => {
    const audio = getAudioElement();

    // Sync volume from localStorage on mount
    const storedVolume = getStoredVolume();
    audio.volume = storedVolume ?? audio.volume;
    usePlayerStore.setState({
      volume: audio.volume,
      isMuted: audio.muted || audio.volume === 0,
    });

    // Set up event listeners
    const handleTimeUpdate = () => {
      if (!isCurrentAudioSource(audio)) return;
      usePlayerStore.setState({ currentTime: audio.currentTime });
    };

    const handleDurationChange = () => {
      if (!isCurrentAudioSource(audio)) return;

      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : 0;
      const pendingSeekTime = usePlayerStore.getState().pendingSeekTime;

      if (duration > 0 && pendingSeekTime !== null) {
        const targetTime = Math.min(pendingSeekTime, duration);
        try {
          audio.currentTime = targetTime;
          usePlayerStore.setState({
            duration,
            currentTime: targetTime,
            pendingSeekTime: null,
          });
          return;
        } catch {
          // A later media event will retry once the stream becomes seekable.
        }
      }

      usePlayerStore.setState({ duration });
    };

    const handlePlay = () => {
      if (!isCurrentAudioSource(audio) || audio.paused) return;
      usePlayerStore.setState({ status: "playing" });
    };

    const handlePause = () => {
      // Only update state if we're not in loading status
      // This prevents flickering when loading a new track
      if (usePlayerStore.getState().status !== "loading") {
        usePlayerStore.setState({ status: "paused" });
      }
    };

    const handleEnded = () => {
      if (!isCurrentAudioSource(audio) || !audio.ended) return;
      nextTrack();
    };

    const handleError = (e: Event) => {
      if (!isCurrentAudioSource(audio) || !audio.error) return;
      console.error("Audio element error:", e);
      // Only update state if we're not already in error status
      // This prevents error toast loops
      if (usePlayerStore.getState().status !== "error") {
        usePlayerStore.setState({ status: "error" });
        toast.error("Playback error occurred");
      }
    };

    const handleVolumeChange = () => {
      usePlayerStore.setState({
        volume: audio.volume,
        isMuted: audio.muted || audio.volume === 0,
      });
    };

    // Add all event listeners
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("canplay", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("volumechange", handleVolumeChange);

    // Cleanup function
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("canplay", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("volumechange", handleVolumeChange);
    };
  }, [nextTrack]);

  return null;
}

// MediaSession API support
export function useMediaSession() {
  const { currentTrack, status, play, pause, nextTrack, previousTrack, seek } =
    usePlayerStore(
      (state) => ({
        currentTrack: state.currentTrack,
        status: state.status,
        play: state.play,
        pause: state.pause,
        nextTrack: state.nextTrack,
        previousTrack: state.previousTrack,
        seek: state.seek,
      }),
      shallow,
    );

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Update metadata when track changes
    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.userId ?? "Unknown Artist",
        album: currentTrack.albumId ?? "",
        artwork: currentTrack.artworkUrl
          ? [
              {
                src: currentTrack.artworkUrl,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    // Update playback state
    navigator.mediaSession.playbackState =
      status === "playing"
        ? "playing"
        : status === "paused"
          ? "paused"
          : "none";

    // Set up handlers
    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      previousTrack(),
    );
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });

    // Cleanup
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, [currentTrack, status, play, pause, nextTrack, previousTrack, seek]);
}

// Keyboard navigation support
export function useKeyboardControls() {
  const { togglePlay, nextTrack, previousTrack } = usePlayerStore(
    (state) => ({
      togglePlay: state.togglePlay,
      nextTrack: state.nextTrack,
      previousTrack: state.previousTrack,
    }),
    shallow,
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, button, a[href], [contenteditable="true"], [role="button"], [role="textbox"]',
        )
      ) {
        return;
      }

      switch (e.key) {
        case " ": // Space bar toggles play/pause
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            nextTrack();
          }
          break;
        case "ArrowLeft":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            previousTrack();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [togglePlay, nextTrack, previousTrack]);
}

// Main playback controller component
export function PlayerController({
  userId: _userId,
}: {
  userId: string | undefined;
}) {
  // Set up audio events
  useAudioEvents();
  // Set up media session
  useMediaSession();
  // Set up keyboard controls
  useKeyboardControls();

  // Get state and actions from store
  const { currentTrack, status } = usePlayerStore(
    (state) => ({
      currentTrack: state.currentTrack,
      status: state.status,
    }),
    shallow,
  );

  // Set up direct playback when track changes
  useEffect(() => {
    if (currentTrack && status === "loading") {
      const audio = getAudioElement();
      const requestedTrackId = currentTrack.id;
      const streamUrl = getTrackStreamUrl(currentTrack.id);

      // Set the audio source
      audio.src = streamUrl;
      audio.load();
      recordPlay(requestedTrackId);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          if (
            isAbortError(error) ||
            usePlayerStore.getState().currentTrack?.id !== requestedTrackId
          ) {
            return;
          }
          console.error("Error playing audio:", error);
          if (usePlayerStore.getState().status !== "error") {
            usePlayerStore.setState({ status: "error" });
            toast.error("Failed to play track");
          }
        });
      }
    }
  }, [currentTrack, status]);

  return null;
}
