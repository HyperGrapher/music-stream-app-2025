"use client";

import { create } from "zustand";
import type { PlayerTrack as Track } from "@/types/player-track";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import type { RefObject } from "react";
import { useRef, useEffect } from "react";
import { useStore } from "zustand";
import { shallow } from "zustand/shallow";

throw new Error(
  "DO NOT USE THIS STORE. IT IS DEPRECATED. USE player.tsx INSTEAD.",
);

type Panel = "sidebar" | "tracklist";

// --- Non-reactive Refs ---
let audioRefGlobal: RefObject<HTMLAudioElement> | null = null;
const panelRefsGlobal: Record<Panel, RefObject<HTMLElement> | null> = {
  sidebar: null,
  tracklist: null,
};

// --- State Interface ---
interface PlaybackState {
  // Core State
  isPlaying: boolean;
  currentTrack: Track | null;
  playlist: Track[];
  audioSrc: string | undefined;
  playbackToken: string | null;
  userId: string | undefined;

  // Time State
  currentTime: number;
  duration: number;

  // Volume State
  volume: number; // 0 to 1
  isMuted: boolean;

  // UI/Keyboard State
  activePanel: Panel;

  // --- Actions ---
  setUserId: (userId: string | undefined) => void;
  setAudioRef: (ref: RefObject<HTMLAudioElement> | null) => void;
  togglePlayPause: () => void;
  playTrack: (track: Track) => void;
  setTokenAndPrepare: (token: string, trackId: string) => void;
  handlePlaybackError: (errorMsg?: string, keepTrack?: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  setCurrentTime: (time: number) => void;
  seekTo: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaylist: (songs: Track[]) => void;
  setActivePanel: (panel: Panel) => void;
  registerPanelRef: (panel: Panel, ref: RefObject<HTMLElement>) => void;
  handleKeyNavigation: (e: React.KeyboardEvent) => void;
  setVolume: (volume: number) => void;
  toggleStoreMute: () => void;
  cleanup: () => void;
}

// --- Store Implementation ---
export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  // Initial State
  isPlaying: false,
  currentTrack: null,
  playlist: [],
  audioSrc: undefined,
  playbackToken: null,
  userId: undefined,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  activePanel: "sidebar",

  // --- Actions Implementation ---
  setUserId: (userId) => set({ userId }),

  setAudioRef: (ref) => {
    audioRefGlobal = ref;
    const audio = audioRefGlobal?.current;
    if (audio) {
      console.log(
        "Audio Ref Set. Initializing volume/mute state from element.",
      );
      set({ volume: audio.volume, isMuted: audio.muted });
    }
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setCurrentTime: (time) => set({ currentTime: time }),
  seekTo: (time) => {
    const audio = audioRefGlobal?.current;
    if (audio) {
      const duration = get().duration;
      const newTime = Math.max(0, Math.min(duration || 0, time));
      if (isFinite(newTime)) {
        audio.currentTime = newTime;
        set({ currentTime: newTime });
      }
    }
  },
  setDuration: (duration) =>
    set({ duration: isFinite(duration) ? duration : 0 }),
  setPlaylist: (songs) => set({ playlist: songs }),
  setActivePanel: (panel) => set({ activePanel: panel }),

  registerPanelRef: (panel, ref) => {
    panelRefsGlobal[panel] = ref;
  },

  togglePlayPause: () => {
    const { isPlaying, currentTrack, audioSrc } = get();
    const audio = audioRefGlobal?.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      set({ isPlaying: false });
    } else {
      if (audioSrc && currentTrack) {
        if (audio.src !== audioSrc) {
          console.warn("Audio src mismatch, setting before playing.");
          audio.src = audioSrc;
          audio.load();
        }
        audio.play().catch((error) => {
          console.error("Audio play error on toggle:", error);
          toast.error("Playback failed.");
          get().handlePlaybackError("Playback failed on toggle");
        });
        set({ isPlaying: true });
      } else {
        console.log("Play toggle ignored: No audioSrc or currentTrack");
      }
    }
  },

  playTrack: (track) => {
    console.log("🚩 Zustand: playTrack action called with:", track);
    const audio = audioRefGlobal?.current;
    if (audio) {
      // Properly clean up the audio element
      try {
        audio.pause();
        audio.currentTime = 0;
        // Clear the source to force a complete reset
        audio.src = "";
        audio.load(); // Explicitly load to clear any pending operations
      } catch (e) {
        console.error("Error cleaning up audio element:", e);
      }
    }

    // Manually reset any previous token data to force a new request
    set({
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      audioSrc: undefined,
      playbackToken: null,
    });
    get().setActivePanel("tracklist");
  },

  setTokenAndPrepare: (token, trackId) => {
    console.log("Zustand: Setting token and preparing src", token);
    const newAudioSrc = `http://localhost:4000/tracks/stream/${trackId}?token=${token}`;
    set({ playbackToken: token, audioSrc: newAudioSrc });
  },

  handlePlaybackError: (errorMsg = "Playback failed.", keepTrack = false) => {
    console.error("Zustand: Handling playback error", errorMsg);
    toast.error(errorMsg);
    const audio = audioRefGlobal?.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    const stateUpdate: Partial<PlaybackState> = {
      isPlaying: false,
      audioSrc: undefined,
      playbackToken: null,
      currentTime: 0,
      duration: 0,
    };
    if (!keepTrack) {
      stateUpdate.currentTrack = null;
    }
    set(stateUpdate);
  },

  playNextTrack: () => {
    const { currentTrack, playlist } = get();
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t?.id === currentTrack.id);
    if (currentIndex === -1) {
      if (playlist.length > 0) get().playTrack(playlist[0] as Track);
      return;
    }
    const nextIndex = (currentIndex + 1) % playlist.length;
    if (playlist[nextIndex]) {
      get().playTrack(playlist[nextIndex] as Track);
    }
  },

  playPreviousTrack: () => {
    const { currentTrack, playlist } = get();
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex((t) => t?.id === currentTrack.id);
    if (currentIndex === -1) {
      if (playlist.length > 0) get().playTrack(playlist[0] as Track);
      return;
    }
    const previousIndex =
      (currentIndex - 1 + playlist.length) % playlist.length;
    if (playlist[previousIndex]) {
      get().playTrack(playlist[previousIndex] as Track);
    }
  },

  setVolume: (newVolume) => {
    const audio = audioRefGlobal?.current;
    if (audio) {
      const clampedVolume = Math.max(0, Math.min(1, newVolume));
      audio.volume = clampedVolume;
      audio.muted = clampedVolume === 0;
    }
  },

  toggleStoreMute: () => {
    const audio = audioRefGlobal?.current;
    if (audio) {
      audio.muted = !audio.muted;
    }
  },

  handleKeyNavigation: (e) => {
    const { activePanel, setActivePanel } = get();
    const currentRef = panelRefsGlobal[activePanel];
    if (!currentRef?.current) return;
    const items = Array.from(
      currentRef.current.querySelectorAll<HTMLElement>('[tabindex="0"]'),
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = -1;
    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        nextIndex =
          currentIndex === -1
            ? 0
            : (currentIndex - 1 + items.length) % items.length;
        break;
      case "h":
        if (activePanel === "tracklist") {
          e.preventDefault();
          setActivePanel("sidebar");
          setTimeout(() => {
            panelRefsGlobal.sidebar?.current
              ?.querySelector<HTMLElement>('[tabindex="0"]')
              ?.focus();
          }, 0);
        }
        break;
      case "l":
        if (activePanel === "sidebar") {
          e.preventDefault();
          setActivePanel("tracklist");
          setTimeout(() => {
            panelRefsGlobal.tracklist?.current
              ?.querySelector<HTMLElement>('[tabindex="0"]')
              ?.focus();
          }, 0);
        }
        break;
      default:
        break;
    }
    if (nextIndex !== -1 && items[nextIndex]) {
      (items[nextIndex] as HTMLElement)?.focus();
    }
  },

  cleanup: () => {
    console.log("Zustand store cleanup triggered.");
    const audio = audioRefGlobal?.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioRefGlobal = null;
    panelRefsGlobal.sidebar = null;
    panelRefsGlobal.tracklist = null;
  },
}));

// --- Hooks for Managing Side Effects ---

const useAudioEvents = () => {
  const {
    setCurrentTime,
    setDuration,
    playNextTrack,
    setAudioRef,
    handlePlaybackError,
  } = usePlaybackStore((state) => ({
    setCurrentTime: state.setCurrentTime,
    setDuration: state.setDuration,
    playNextTrack: state.playNextTrack,
    setAudioRef: state.setAudioRef,
    handlePlaybackError: state.handlePlaybackError,
  }));
  const audioRefHook = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setAudioRef(audioRefHook as RefObject<HTMLAudioElement>);
    return () => {
      setAudioRef(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRefHook.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      usePlaybackStore.setState({ isPlaying: false });
      playNextTrack();
    };
    const handleError = (e: Event) => {
      console.error("Audio Element Error:", e);
      handlePlaybackError("Audio playback error.", true);
    };
    const handleVolumeChange = () => {
      console.log("AudioEvt: volumechange event", audio.volume, audio.muted);
      usePlaybackStore.setState({ volume: audio.volume, isMuted: audio.muted });
    };
    const handlePlay = () => usePlaybackStore.setState({ isPlaying: true });
    const handlePause = () => usePlaybackStore.setState({ isPlaying: false });
    const handleCanPlay = () => console.log("Audio can play.");
    const handleWaiting = () => console.log("Audio waiting...");

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("volumechange", handleVolumeChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("volumechange", handleVolumeChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
    };
  }, [setCurrentTime, setDuration, playNextTrack, handlePlaybackError]);

  return audioRefHook;
};

const useGlobalKeyListeners = () => {
  const { togglePlayPause, handleKeyNavigation, currentTrack } =
    usePlaybackStore((state) => ({
      togglePlayPause: state.togglePlayPause,
      handleKeyNavigation: state.handleKeyNavigation,
      currentTrack: state.currentTrack,
    }));
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      handleKeyNavigation(e as any);
      if (!e.defaultPrevented) {
        if (e.key === " " && e.target === document.body && currentTrack) {
          e.preventDefault();
          togglePlayPause();
        } else if (e.key === "/") {
          e.preventDefault();
          document
            .querySelector<HTMLInputElement>('input[type="search"]')
            ?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [togglePlayPause, handleKeyNavigation, currentTrack]);
};

const useMediaSession = () => {
  const { togglePlayPause, playNextTrack, playPreviousTrack, seekTo } =
    usePlaybackStore((state) => ({
      togglePlayPause: state.togglePlayPause,
      playNextTrack: state.playNextTrack,
      playPreviousTrack: state.playPreviousTrack,
      seekTo: state.seekTo,
    }));

  const { currentTrack, isPlaying } = useStore(
    usePlaybackStore,
    (state) => ({
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
    }),
    (a, b) => {
      const oldTrackId = a.currentTrack?.id;
      const newTrackId = b.currentTrack?.id;
      return oldTrackId === newTrackId && a.isPlaying === b.isPlaying;
    },
  );

  useEffect(() => {
    const audio = audioRefGlobal?.current;
    const mediaSession = navigator.mediaSession;
    if (!mediaSession || !currentTrack || !audio) {
      if (mediaSession) {
        mediaSession.metadata = null;
        mediaSession.playbackState = "none";
        mediaSession.setActionHandler("play", null);
        mediaSession.setActionHandler("pause", null);
        mediaSession.setActionHandler("previoustrack", null);
        mediaSession.setActionHandler("nexttrack", null);
        mediaSession.setActionHandler("seekto", null);
      }
      return;
    }
    mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.userId || "Unknown Artist",
      album: currentTrack.albumId || "",
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
    const playHandler = () => {
      audio.play().catch((e) => {});
      setImmediate(togglePlayPause);
    };
    const pauseHandler = () => {
      audio.pause();
      setImmediate(togglePlayPause);
    };
    const previousTrackHandler = () => playPreviousTrack();
    const nextTrackHandler = () => playNextTrack();
    const seekToHandler = (details: MediaSessionActionDetails) => {
      if (details.seekTime != null) {
        seekTo(details.seekTime);
      }
    };
    mediaSession.setActionHandler("play", playHandler);
    mediaSession.setActionHandler("pause", pauseHandler);
    mediaSession.setActionHandler("previoustrack", previousTrackHandler);
    mediaSession.setActionHandler("nexttrack", nextTrackHandler);
    mediaSession.setActionHandler("seekto", seekToHandler);
    return () => {
      if (mediaSession) {
        mediaSession.setActionHandler("play", null);
        mediaSession.setActionHandler("pause", null);
        mediaSession.setActionHandler("previoustrack", null);
        mediaSession.setActionHandler("nexttrack", null);
        mediaSession.setActionHandler("seekto", null);
      }
    };
  }, [
    currentTrack,
    isPlaying,
    togglePlayPause,
    playNextTrack,
    playPreviousTrack,
    seekTo,
  ]);

  useEffect(() => {
    const audio = audioRefGlobal?.current;
    const mediaSession = navigator.mediaSession;
    if (!mediaSession || !audio) return;
    const updatePositionState = () => {
      if (audio && isFinite(audio.duration)) {
        try {
          mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (error) {
          /* Ignore */
        }
      }
    };
    const intervalId = setInterval(updatePositionState, 1000);
    return () => clearInterval(intervalId);
  }, [isPlaying]);

  useEffect(() => {
    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);
};

// --- Initializer Component ---
export function PlaybackInitializer({
  userId,
}: {
  userId: string | undefined;
}) {
  const setUserIdAction = usePlaybackStore((state) => state.setUserId);
  const audioRef = useAudioEvents();
  useGlobalKeyListeners();
  useMediaSession();

  // Common ref to track reset attempts and prevent infinite loops
  const resetAttemptedRef = useRef(false);
  const lastResetTimeRef = useRef(0);
  const MIN_RESET_INTERVAL = 1000; // Minimum 1 second between reset attempts

  const resetMutationIfNeeded = () => {
    // Only allow resets once per second to prevent infinite loops
    const now = Date.now();
    if (now - lastResetTimeRef.current < MIN_RESET_INTERVAL) {
      console.log("Skipping reset: too frequent");
      return false;
    }

    resetAttemptedRef.current = true;
    lastResetTimeRef.current = now;
    getPlaybackTokenMutation.reset();
    return true;
  };

  const {
    currentTrack,
    playbackToken,
    setTokenAndPrepare,
    handlePlaybackError,
    setIsPlaying,
  } = usePlaybackStore((state) => ({
    currentTrack: state.currentTrack,
    playbackToken: state.playbackToken,
    setTokenAndPrepare: state.setTokenAndPrepare,
    handlePlaybackError: state.handlePlaybackError,
    setIsPlaying: state.setIsPlaying,
  }));

  const getPlaybackTokenMutation = api.stream.getPlaybackToken.useMutation({
    onSuccess: (data, variables) => {
      console.log("Initializer: Mutation Success", data);
      setTokenAndPrepare(data.token, variables.trackId);
      resetAttemptedRef.current = false;
    },
    onError: (error) => {
      console.error("Initializer: Mutation Error:", error);
      const message =
        error.data?.code === "UNAUTHORIZED"
          ? "Unauthorized to play this track."
          : "Failed to get playback token.";
      handlePlaybackError(message, error.data?.code === "UNAUTHORIZED");
      resetAttemptedRef.current = false;
    },
  });

  useEffect(() => {
    if (
      currentTrack &&
      !playbackToken &&
      userId &&
      getPlaybackTokenMutation.status === "idle" &&
      !getPlaybackTokenMutation.isError
    ) {
      console.log(
        `Initializer: Triggering mutation for track: ${currentTrack.id} (Status: ${getPlaybackTokenMutation.status})`,
      );
      // When a track is selected, request a token which will then set audioSrc
      // and trigger playback in the audioSrc effect below
      resetAttemptedRef.current = false; // Reset the flag when a successful request is made
      getPlaybackTokenMutation.mutate({ trackId: currentTrack.id });
    } else if (!currentTrack) {
      if (getPlaybackTokenMutation.status !== "idle") {
        getPlaybackTokenMutation.reset();
      }
    } else {
      // Debug why the token request wasn't triggered
      console.log("Token request conditions not met:", {
        hasTrack: !!currentTrack,
        noToken: !playbackToken,
        hasUserId: !!userId,
        mutationIdle: getPlaybackTokenMutation.status === "idle",
        noError: !getPlaybackTokenMutation.isError,
      });

      // If all conditions are met except mutation status, reset it
      // But don't attempt too frequently to avoid infinite loops
      if (
        currentTrack &&
        !playbackToken &&
        userId &&
        (getPlaybackTokenMutation.status !== "idle" ||
          getPlaybackTokenMutation.isError) &&
        !resetAttemptedRef.current
      ) {
        console.log("Resetting mutation to allow new token request");
        resetMutationIfNeeded();
      }
    }
  }, [currentTrack, playbackToken, userId, getPlaybackTokenMutation]);

  const audioSrc = usePlaybackStore((state) => state.audioSrc);

  // Add tracking of the current track ID to detect changes
  const currentTrackId = usePlaybackStore((state) => state.currentTrack?.id);
  const previousTrackIdRef = useRef<string | undefined>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Track ID has changed, force a reset
    if (currentTrackId !== previousTrackIdRef.current) {
      console.log(
        `Initializer: Track ID changed from ${previousTrackIdRef.current} to ${currentTrackId}`,
      );
      previousTrackIdRef.current = currentTrackId;

      // If we don't have an audioSrc yet but have a track ID,
      // make sure we force the mutation to reset in the next cycle
      if (!audioSrc && currentTrackId && !resetAttemptedRef.current) {
        console.log(
          "Initializer: No audioSrc but track changed, will reset mutation once",
        );
        resetMutationIfNeeded();
        return;
      }
    }

    // Handle audio source change
    if (audioSrc) {
      // Reset our flag when we get a valid audioSrc
      resetAttemptedRef.current = false;

      console.log("Initializer: Setting audio source and playing", audioSrc);
      audio.src = audioSrc;
      audio.load();
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Initializer: Playback started successfully.");
          })
          .catch((error) => {
            if (error.name === "AbortError") {
              console.warn(
                "Initializer: Playback aborted, likely due to new track selection.",
              );
              return;
            }
            console.error("Initializer: Error starting playback:", error);
            handlePlaybackError("Error starting playback.", true);
          });
      }
    }
  }, [audioSrc, audioRef, currentTrackId, handlePlaybackError]);

  useEffect(() => {
    setUserIdAction(userId);
  }, [userId, setUserIdAction]);

  return <audio ref={audioRef} id="global-audio-player" preload="metadata" />;
}

// NOTE: Ensure <PlaybackInitializer> is rendered *once* in your app layout.
