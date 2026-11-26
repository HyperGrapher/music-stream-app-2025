"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import {
  nextRepeat,
  type QueueState,
  pickNext,
  pickPrevious,
  pushHistory,
  queueLast,
  queueNext,
  toggleShuffleOrder,
  type RepeatMode,
} from "@/lib/player-queue";
import { vanillaApi } from "@/trpc/vanilla";
import type { PlayerTrack as Track } from "@/types/player-track";

// Defined playback states for clear control flow
type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type PlaySourceName =
  | "PROFILE" | "TRACK_PAGE" | "COLLECTION" | "FEED" | "HOME" | "DISCOVER" | "SEARCH" | "CHARTS" | "LIBRARY"
  | "HISTORY" | "STATION" | "EMBED" | "OTHER";

/** Where a list of tracks was played from: names the queue context and credits plays (PRD PL-P9). */
export interface ContextMeta {
  name?: string | null;
  source?: PlaySourceName;
  collectionId?: string | null;
}

interface PlayerState {
  // Core state
  status: PlaybackStatus;
  currentTrack: Track | null;
  /** The context: the list the user played from (a collection, a profile tab, search results...). */
  playlist: Track[];
  contextName: string | null;
  contextSource: PlaySourceName;
  contextCollectionId: string | null;
  /** Shuffled order of the context (ids) while shuffle is on. */
  order: string[] | null;
  /** Last context track played: the context resumes after it when queued tracks are done. */
  cursorId: string | null;
  userQueue: Track[];
  history: Track[];
  shuffle: boolean;
  repeat: RepeatMode;
  autoplay: boolean;
  nextUpOpen: boolean;
  sheetOpen: boolean;
  volume: number; // 0 to 1
  isMuted: boolean;
  currentTime: number;
  duration: number;
  /** Seconds of the media that are buffered ahead of the playhead (for the seek bar). */
  bufferedEnd: number;
  pendingSeekTime: number | null;

  // Actions
  playTrack: (track: Track) => void;
  /** Sets the context and starts `track` in it (the usual "click a row" action). */
  playContext: (tracks: Track[], track: Track, meta?: ContextMeta) => void;
  setPlaylist: (tracks: Track[], meta?: ContextMeta) => void;
  togglePlay: () => void;
  pause: () => void;
  play: () => void;
  seek: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  playFromQueue: (id: string) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleAutoplay: () => void;
  setNextUpOpen: (open: boolean) => void;
  setSheetOpen: (open: boolean) => void;
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

/** The pure queue lib's view of the store (the store calls its context `playlist`). */
const queueOf = (s: PlayerState): QueueState<Track> => ({ context: s.playlist, order: s.order, currentId: s.currentTrack?.id ?? null, cursorId: s.cursorId, userQueue: s.userQueue, history: s.history, repeat: s.repeat });

const getTrackStreamUrl = (track: Pick<Track, "id" | "streamUrl">) =>
  track.streamUrl ?? `/api/tracks/${encodeURIComponent(track.id)}/stream`;

/** UP-F3: formats the browser cannot play are skipped. Normalises the mime types uploads carry. */
const MIME_ALIASES: Record<string, string> = { "audio/m4a": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/mp3": "audio/mpeg", "audio/x-wav": "audio/wav", "audio/aac": "audio/aac" };
export function canPlayTrack(track: Pick<Track, "mimeType">): boolean {
  if (!track.mimeType || typeof window === "undefined") return true;
  const type = MIME_ALIASES[track.mimeType] ?? track.mimeType;
  return getAudioElement().canPlayType(type) !== "";
}

// A play is reported once the listener has actually heard a few seconds, so
// skipping through a queue does not inflate counts. The server dedupes further.
const PLAY_REPORT_AFTER_SECONDS = 5;
let playReportedFor: string | null = null;
/** Play event of the current track (returned by the play request) and how much of it was really heard. */
let playEventId: string | null = null;
let listenedMs = 0;
let lastTick: number | null = null;

const sourceFromPath = (pathname: string): PlaySourceName => {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "HOME";
  if (parts[0] === "discover") return "DISCOVER";
  if (parts[0] === "search") return "SEARCH";
  if (parts[0] === "charts") return "CHARTS";
  if (parts[0] === "feed") return "FEED";
  if (parts[0] === "you") return "LIBRARY";
  if (parts[1] === "sets") return "COLLECTION";
  if (parts.length >= 2 && !["tracks", "popular-tracks", "albums", "reposts", "likes", "followers", "following"].includes(parts[1]!)) return "TRACK_PAGE";
  return "PROFILE";
};

/** Sends the real listening time of the finished track (PL-P9); beacons survive page unloads. */
function flushProgress(track: Track | null, duration: number) {
  if (!track || !playEventId || listenedMs < 1000) return;
  const body = JSON.stringify({ listenedMs: Math.round(listenedMs), completed: duration > 0 && listenedMs / 1000 >= duration * 0.9 });
  try {
    navigator.sendBeacon(`/api/plays/${playEventId}/progress`, new Blob([body], { type: "application/json" }));
  } catch {
    // Statistics only: never interrupt playback.
  }
  playEventId = null;
  listenedMs = 0;
}

const recordPlay = (track: Pick<Track, "id" | "accessQuery">) => {
  const { contextSource, contextCollectionId } = usePlayerStore.getState();
  const query = track.accessQuery ? `?${track.accessQuery}` : "";
  void fetch(`/api/tracks/${encodeURIComponent(track.id)}/play${query}`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: contextSource, ...(contextCollectionId ? { collectionId: contextCollectionId } : {}) }),
  })
    .then(async (response) => {
      if (response.ok && response.headers.get("content-type")?.includes("json")) {
        const body = (await response.json()) as { eventId?: string };
        if (usePlayerStore.getState().currentTrack?.id === track.id) playEventId = body.eventId ?? null;
      }
    })
    .catch(() => undefined);
};

const isCurrentAudioSource = (audio: HTMLAudioElement) => {
  const currentTrack = usePlayerStore.getState().currentTrack;
  if (!currentTrack || typeof window === "undefined") return false;

  const expectedSource = new URL(getTrackStreamUrl(currentTrack), window.location.href).href;
  return audio.src === expectedSource;
};

/** Autoplay (PL-P5): when the context ends, continue with related tracks, labelled by what they are based on. */
async function continueWithRelated(seed: Track) {
  try {
    const related = await vanillaApi.tracks.related.query({ trackId: seed.id, limit: 25 });
    const fresh = related.filter((t) => canPlayTrack(t) && t.id !== seed.id);
    const first = fresh[0];
    if (!first) {
      usePlayerStore.setState({ status: "paused" });
      return;
    }
    const state = usePlayerStore.getState();
    usePlayerStore.setState({ playlist: [seed, ...fresh], order: state.shuffle ? toggleShuffleOrder({ context: [seed, ...fresh], order: null, currentId: seed.id }, true) : null, contextName: `Autoplay: based on ${seed.title}`, contextCollectionId: null, contextSource: "OTHER" });
    startTrack(first, "context");
  } catch {
    usePlayerStore.setState({ status: "paused" });
  }
}

/** Switches to `track`: finishes the previous one's statistics and history, then loads the new one. */
function startTrack(track: Track, from: "queue" | "context" | "wrap" | "direct", patch: Partial<PlayerState> = {}) {
  const state = usePlayerStore.getState();
  const audio = getAudioElement();
  flushProgress(state.currentTrack, state.duration);
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  const inContext = state.playlist.some((t) => t.id === track.id);
  usePlayerStore.setState({
    currentTrack: track,
    history: state.currentTrack && state.currentTrack.id !== track.id ? pushHistory(state.history, state.currentTrack) : state.history,
    cursorId: from === "queue" ? state.cursorId : inContext ? track.id : state.cursorId,
    status: "loading",
    currentTime: 0,
    duration: 0,
    bufferedEnd: 0,
    pendingSeekTime: null,
    ...patch,
  });
}

const PERSIST_KEY = "player-state-v1";

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  status: "idle",
  currentTrack: null,
  playlist: [],
  contextName: null,
  contextSource: "OTHER",
  contextCollectionId: null,
  order: null,
  cursorId: null,
  userQueue: [],
  history: [],
  shuffle: false,
  repeat: "off",
  autoplay: true,
  nextUpOpen: false,
  sheetOpen: false,
  volume: 1,
  isMuted: false,
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
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
    startTrack(track, "direct");
  },

  playContext: (tracks, track, meta) => {
    get().setPlaylist(tracks, meta);
    get().playTrack(track);
  },

  setPlaylist: (tracks, meta = {}) => {
    const { shuffle, currentTrack } = get();
    set({
      playlist: tracks,
      order: shuffle ? toggleShuffleOrder({ context: tracks, order: null, currentId: currentTrack?.id ?? null }, true) : null,
      contextName: meta.name ?? null,
      contextSource: meta.source ?? (typeof window === "undefined" ? "OTHER" : sourceFromPath(window.location.pathname)),
      contextCollectionId: meta.collectionId ?? null,
      cursorId: currentTrack && tracks.some((t) => t.id === currentTrack.id) ? currentTrack.id : null,
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
        if (isAbortError(error) || get().currentTrack?.id !== requestedTrackId) return;

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

    const mediaDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;

    if (mediaDuration === null) {
      set({ currentTime: time, pendingSeekTime: time });
      return;
    }

    const targetTime = Math.min(time, mediaDuration);
    audio.currentTime = targetTime;
    set({ currentTime: targetTime, pendingSeekTime: null });
  },

  // Next: the user queue first, then the context, wrapping or continuing with related tracks (PL-P2, PL-P5)
  nextTrack: () => {
    const state = get();
    const audio = getAudioElement();
    if (!state.currentTrack) return;
    const result = pickNext(queueOf(state), { canPlay: canPlayTrack, autoplay: state.autoplay });
    if (result.kind === "track") {
      startTrack(result.track, result.from, { userQueue: result.userQueue, order: result.order });
    } else if (result.kind === "autoplay") {
      void continueWithRelated(state.currentTrack);
    } else if (audio.ended || state.status === "playing") {
      set({ status: "paused", currentTime: state.duration });
    }
  },

  // Previous: restart after 3 s, else the previous track (history, then context)
  previousTrack: () => {
    const state = get();
    if (!state.currentTrack) return;
    const result = pickPrevious(queueOf(state), state.currentTime, canPlayTrack);
    if (result.kind === "restart") {
      get().seek(0);
      return;
    }
    // Going back must not push the track we leave onto the history it was just popped from.
    startTrack(result.track, "context", { history: result.history });
    set({ cursorId: state.playlist.some((t) => t.id === result.track.id) ? result.track.id : state.cursorId });
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

    set({ volume: clampedVolume, isMuted: audio.muted });
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

  playNext: (track) => {
    if (!get().currentTrack) {
      get().playContext([track], track);
      return;
    }
    set((s) => ({ userQueue: queueNext(s.userQueue, track) }));
    toast.success(`“${track.title}” plays next`);
  },
  addToQueue: (track) => {
    if (!get().currentTrack) {
      get().playContext([track], track);
      return;
    }
    set((s) => ({ userQueue: queueLast(s.userQueue, track) }));
    toast.success("Added to Next up");
  },
  removeFromQueue: (id) => set((s) => ({ userQueue: s.userQueue.filter((t) => t.id !== id) })),
  moveInQueue: (from, to) =>
    set((s) => {
      const queue = [...s.userQueue];
      const [moved] = queue.splice(from, 1);
      if (moved) queue.splice(to, 0, moved);
      return { userQueue: queue };
    }),
  clearQueue: () => set({ userQueue: [] }),
  playFromQueue: (id) => {
    const { userQueue } = get();
    const track = userQueue.find((t) => t.id === id);
    if (!track) return;
    startTrack(track, "queue", { userQueue: userQueue.filter((t) => t.id !== id) });
  },

  toggleShuffle: () => {
    const { shuffle, playlist, order, currentTrack } = get();
    const on = !shuffle;
    set({ shuffle: on, order: toggleShuffleOrder({ context: playlist, order, currentId: currentTrack?.id ?? null }, on) });
  },
  cycleRepeat: () => set((s) => ({ repeat: nextRepeat(s.repeat) })),
  toggleAutoplay: () => set((s) => ({ autoplay: !s.autoplay })),
  setNextUpOpen: (open) => set({ nextUpOpen: open }),
  setSheetOpen: (open) => set({ sheetOpen: open }),
}));

// ---------------------------------------------------------------------------------------------
// Persistence (PL-P6): queue, position, volume, shuffle/repeat/autoplay survive reloads; never autoplays.
// ---------------------------------------------------------------------------------------------

function savePlayerState() {
  try {
    const s = usePlayerStore.getState();
    if (!s.currentTrack) {
      localStorage.removeItem(PERSIST_KEY);
      return;
    }
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        currentTrack: s.currentTrack,
        playlist: s.playlist.slice(0, 200),
        contextName: s.contextName,
        contextSource: s.contextSource,
        contextCollectionId: s.contextCollectionId,
        order: s.order,
        cursorId: s.cursorId,
        userQueue: s.userQueue.slice(0, 200),
        history: s.history,
        position: s.currentTime,
        shuffle: s.shuffle,
        repeat: s.repeat,
        autoplay: s.autoplay,
      }),
    );
  } catch {
    // Storage may be unavailable or full; playback works without it.
  }
}

function restorePlayerState() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw || usePlayerStore.getState().currentTrack) return;
    const saved = JSON.parse(raw) as Partial<PlayerState> & { position?: number };
    if (!saved.currentTrack?.id) return;
    usePlayerStore.setState({
      currentTrack: saved.currentTrack,
      playlist: saved.playlist ?? [saved.currentTrack],
      contextName: saved.contextName ?? null,
      contextSource: saved.contextSource ?? "OTHER",
      contextCollectionId: saved.contextCollectionId ?? null,
      order: saved.order ?? null,
      cursorId: saved.cursorId ?? saved.currentTrack.id,
      userQueue: saved.userQueue ?? [],
      history: saved.history ?? [],
      shuffle: saved.shuffle ?? false,
      repeat: saved.repeat ?? "off",
      autoplay: saved.autoplay ?? true,
      // Paused at the saved position: pressing play loads the stream and seeks there.
      status: "paused",
      currentTime: saved.position ?? 0,
      pendingSeekTime: saved.position && saved.position > 1 ? saved.position : null,
    });
  } catch {
    // A corrupt entry is ignored.
  }
}

/** Retry budget for an expired or broken stream URL (PL-P10): one transparent re-request, then skip. */
let retriedFor: string | null = null;
let skipTimer: ReturnType<typeof setTimeout> | null = null;

// Hook to set up audio events
export function useAudioEvents() {
  useEffect(() => {
    const audio = getAudioElement();

    // Sync volume from localStorage on mount
    const storedVolume = getStoredVolume();
    audio.volume = storedVolume ?? audio.volume;
    usePlayerStore.setState({
      volume: audio.volume,
      isMuted: audio.muted || audio.volume === 0,
    });
    restorePlayerState();

    // Set up event listeners
    const handleTimeUpdate = () => {
      if (!isCurrentAudioSource(audio)) return;
      usePlayerStore.setState({ currentTime: audio.currentTime });

      // Real listening time: only ticks while playing, ignoring seeks (a jump is not listening).
      const now = performance.now();
      if (!audio.paused && lastTick !== null) {
        const delta = now - lastTick;
        if (delta > 0 && delta < 1500) listenedMs += delta;
      }
      lastTick = audio.paused ? null : now;

      const track = usePlayerStore.getState().currentTrack;
      if (track && playReportedFor !== track.id && !audio.paused && audio.currentTime >= PLAY_REPORT_AFTER_SECONDS) {
        playReportedFor = track.id;
        recordPlay(track);
      }
    };

    const handleProgress = () => {
      if (!isCurrentAudioSource(audio) || audio.buffered.length === 0) return;
      usePlayerStore.setState({ bufferedEnd: audio.buffered.end(audio.buffered.length - 1) });
    };

    const handleDurationChange = () => {
      if (!isCurrentAudioSource(audio)) return;

      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const pendingSeekTime = usePlayerStore.getState().pendingSeekTime;

      if (duration > 0 && pendingSeekTime !== null) {
        const targetTime = Math.min(pendingSeekTime, duration);
        try {
          audio.currentTime = targetTime;
          usePlayerStore.setState({ duration, currentTime: targetTime, pendingSeekTime: null });
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
      lastTick = null;
      // Only update state if we're not in loading status: this prevents flickering when loading a new track
      if (usePlayerStore.getState().status !== "loading") {
        usePlayerStore.setState({ status: "paused" });
      }
    };

    const handleEnded = () => {
      if (!isCurrentAudioSource(audio) || !audio.ended) return;
      const state = usePlayerStore.getState();
      if (state.repeat === "one") {
        // The same track again counts as a new listen.
        flushProgress(state.currentTrack, state.duration);
        playReportedFor = null;
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      state.nextTrack();
    };

    const handleError = (e: Event) => {
      if (!isCurrentAudioSource(audio) || !audio.error) return;
      const state = usePlayerStore.getState();
      const track = state.currentTrack;
      if (!track) return;
      // The presigned URL lasts an hour: a long session can outlive it. Ask for a fresh one once and resume.
      if (retriedFor !== track.id) {
        retriedFor = track.id;
        const resumeAt = audio.currentTime;
        audio.src = `${getTrackStreamUrl(track)}${getTrackStreamUrl(track).includes("?") ? "&" : "?"}r=${Date.now()}`;
        audio.currentTime = 0;
        usePlayerStore.setState({ pendingSeekTime: resumeAt > 0 ? resumeAt : null });
        void audio.play().catch(() => undefined);
        return;
      }
      console.error("Audio element error:", e);
      if (state.status !== "error") {
        usePlayerStore.setState({ status: "error" });
        toast.error(`Couldn't play ${track.title}`);
        // Skip to the next track after 2 s (PL-P10).
        if (skipTimer) clearTimeout(skipTimer);
        skipTimer = setTimeout(() => {
          if (usePlayerStore.getState().currentTrack?.id === track.id && usePlayerStore.getState().status === "error") usePlayerStore.getState().nextTrack();
        }, 2000);
      }
    };

    const handleVolumeChange = () => {
      usePlayerStore.setState({ volume: audio.volume, isMuted: audio.muted || audio.volume === 0 });
    };

    const persist = setInterval(() => {
      if (usePlayerStore.getState().status === "playing") savePlayerState();
    }, 5000);
    const onPageHide = () => {
      const s = usePlayerStore.getState();
      savePlayerState();
      flushProgress(s.currentTrack, s.duration);
    };

    // One tab plays at a time (PL-P11): starting playback elsewhere pauses this tab.
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("music-stream-player");
    const tabId = crypto.randomUUID();
    channel?.addEventListener("message", (event: MessageEvent<{ type: string; tab: string }>) => {
      if (event.data.type === "playing" && event.data.tab !== tabId && usePlayerStore.getState().status === "playing") {
        usePlayerStore.getState().pause();
      }
    });
    const unsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.status === "playing" && previous.status !== "playing") channel?.postMessage({ type: "playing", tab: tabId });
      if (state.currentTrack?.id !== previous.currentTrack?.id || state.userQueue !== previous.userQueue || state.shuffle !== previous.shuffle || state.repeat !== previous.repeat) savePlayerState();
      if (state.currentTrack?.id !== previous.currentTrack?.id) retriedFor = null;
    });

    // Add all event listeners
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("progress", handleProgress);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("canplay", handleDurationChange);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("volumechange", handleVolumeChange);
    window.addEventListener("pagehide", onPageHide);

    // Cleanup function
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("progress", handleProgress);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("canplay", handleDurationChange);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("volumechange", handleVolumeChange);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(persist);
      unsubscribe();
      channel?.close();
    };
  }, []);

  return null;
}

// MediaSession API support (PL-P8)
export function useMediaSession() {
  const { currentTrack, status, duration, currentTime, play, pause, nextTrack, previousTrack, seek } = usePlayerStore(
    useShallow((state) => ({
      currentTrack: state.currentTrack,
      status: state.status,
      duration: state.duration,
      currentTime: state.currentTime,
      play: state.play,
      pause: state.pause,
      nextTrack: state.nextTrack,
      previousTrack: state.previousTrack,
      seek: state.seek,
    })),
  );

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (currentTrack) {
      // Every rendition, so the OS picks the size it needs; type and size are left for the browser to detect.
      const srcSet = currentTrack.artworkSrcSet
        ?.split(",")
        .map((entry) => entry.trim().split(/\s+/))
        .flatMap(([src, w]) => (src && w ? [{ src, sizes: `${Number.parseInt(w, 10)}x${Number.parseInt(w, 10)}` }] : []));
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artistName ?? currentTrack.user?.name ?? "Unknown Artist",
        album: currentTrack.albumId ?? "",
        artwork: srcSet?.length ? srcSet : currentTrack.artworkUrl ? [{ src: currentTrack.artworkUrl }] : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    navigator.mediaSession.playbackState = status === "playing" ? "playing" : status === "paused" ? "paused" : "none";

    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
    navigator.mediaSession.setActionHandler("previoustrack", () => previousTrack());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => seek(Math.max(0, usePlayerStore.getState().currentTime - (details.seekOffset ?? 10))));
    navigator.mediaSession.setActionHandler("seekforward", (details) => seek(usePlayerStore.getState().currentTime + (details.seekOffset ?? 10)));

    return () => {
      for (const action of ["play", "pause", "nexttrack", "previoustrack", "seekto", "seekbackward", "seekforward"] as const) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    };
  }, [currentTrack, status, play, pause, nextTrack, previousTrack, seek]);

  // Keep the OS scrubber in step (setPositionState must always satisfy position <= duration).
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack || !(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({ duration, position: Math.min(currentTime, duration), playbackRate: 1 });
    } catch {
      // Unsupported value combinations are ignored.
    }
  }, [currentTrack, duration, Math.floor(currentTime / 5)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** True while the user is typing: shortcuts stay out of the way (PL-P7). */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null;
const isSlider = (target: EventTarget | null) => target instanceof HTMLElement && target.closest('input[type="range"], [role="slider"]') !== null;

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Space", action: "Play / pause" },
  { keys: "Shift + →  /  Shift + ←", action: "Next / previous track" },
  { keys: "→  /  ←", action: "Seek forward / back 5 s" },
  { keys: "Shift + ↑  /  Shift + ↓", action: "Volume up / down" },
  { keys: "M", action: "Mute" },
  { keys: "S", action: "Shuffle" },
  { keys: "Q", action: "Show / hide Next up" },
  { keys: "?", action: "This list of shortcuts" },
];

// Keyboard shortcuts (PL-P7). `onLike` / `onHelp` are provided by the player bar (they need the like mutation / a dialog).
export function useKeyboardControls(handlers: { onLike?: () => void; onHelp?: () => void } = {}) {
  const { onLike, onHelp } = handlers;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const s = usePlayerStore.getState();
      const onControl = e.target instanceof HTMLElement && e.target.closest('button, a[href], [role="button"]') !== null;
      switch (e.key) {
        case " ":
          if (onControl) return; // Space activates a focused button
          e.preventDefault();
          s.togglePlay();
          break;
        case "ArrowRight":
          if (isSlider(e.target)) return;
          e.preventDefault();
          if (e.shiftKey) s.nextTrack();
          else s.seek(s.currentTime + 5);
          break;
        case "ArrowLeft":
          if (isSlider(e.target)) return;
          e.preventDefault();
          if (e.shiftKey) s.previousTrack();
          else s.seek(Math.max(0, s.currentTime - 5));
          break;
        case "ArrowUp":
          if (!e.shiftKey) return;
          e.preventDefault();
          s.setVolume(s.volume + 0.1);
          break;
        case "ArrowDown":
          if (!e.shiftKey) return;
          e.preventDefault();
          s.setVolume(s.volume - 0.1);
          break;
        case "m":
        case "M":
          s.toggleMute();
          break;
        case "s":
        case "S":
          s.toggleShuffle();
          break;
        case "q":
        case "Q":
          s.setNextUpOpen(!s.nextUpOpen);
          break;
        case "l":
        case "L":
          onLike?.();
          break;
        case "?":
          onHelp?.();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onLike, onHelp]);
}

// Main playback controller component
export function PlayerController({ userId: _userId }: { userId: string | undefined }) {
  useAudioEvents();
  useMediaSession();

  const { currentTrack, status } = usePlayerStore(
    useShallow((state) => ({ currentTrack: state.currentTrack, status: state.status })),
  );

  // Set up direct playback when track changes
  useEffect(() => {
    if (currentTrack && status === "loading") {
      const audio = getAudioElement();
      const requestedTrackId = currentTrack.id;
      const streamUrl = getTrackStreamUrl(currentTrack);

      audio.src = streamUrl;
      audio.load();
      playReportedFor = null; // a (re)started track can be reported again
      listenedMs = 0;
      lastTick = null;
      playEventId = null;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          if (isAbortError(error) || usePlayerStore.getState().currentTrack?.id !== requestedTrackId) return;
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
