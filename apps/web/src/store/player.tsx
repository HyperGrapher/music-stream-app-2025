'use client';

import { create } from 'zustand';
import type { Track } from '@prisma/client';
import { api } from '@/trpc/react';
import { toast } from 'sonner';
import { useRef, useEffect } from 'react';

// Defined playback states for clear control flow
type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

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
  
  // Actions
  loadTrack: (track: Track) => void;
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

// Function to get/create the global audio element
const getAudioElement = (): HTMLAudioElement => {
  if (!audioElement && typeof window !== 'undefined') {
    audioElement = new Audio();
    audioElement.preload = 'auto';
    // Initialize with stored volume or default
    const storedVolume = localStorage.getItem('playerVolume');
    if (storedVolume) {
      audioElement.volume = parseFloat(storedVolume);
    }
  }
  return audioElement as HTMLAudioElement;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  status: 'idle',
  currentTrack: null,
  playlist: [],
  volume: 1,
  isMuted: false,
  currentTime: 0,
  duration: 0,
  
  // Load a track without auto-playing
  loadTrack: (track) => {
    const { status } = get();
    const audio = getAudioElement();
    
    // Stop current playback if any
    if (status === 'playing' || status === 'paused') {
      audio.pause();
    }
    
    set({ 
      currentTrack: track,
      status: 'loading',
      currentTime: 0,
      duration: 0
    });
  },
  
  // Load and play a track
  playTrack: (track) => {
    const { loadTrack, currentTrack } = get();
    
    // Skip if we're already playing this track
    if (currentTrack?.id === track.id) {
      // If we're already playing this track, just toggle play/pause
      get().togglePlay();
      return;
    }
    
    // Load and start playing the new track
    loadTrack(track);
    get().play();
  },
  
  // Toggle between play and pause
  togglePlay: () => {
    const { status, play, pause } = get();
    if (status === 'playing') {
      pause();
    } else {
      play();
    }
  },
  
  // Pause playback
  pause: () => {
    const audio = getAudioElement();
    audio.pause();
    set({ status: 'paused' });
  },
  
  // Start or resume playback
  play: () => {
    const { currentTrack, status } = get();
    if (!currentTrack) return;
    
    // Already playing - do nothing
    if (status === 'playing') return;
    
    // Set loading state while we prepare
    if (status !== 'paused') {
      set({ status: 'loading' });
    }
    
    // If we're resuming from paused state, just play
    if (status === 'paused') {
      const audio = getAudioElement();
      audio.play()
        .then(() => {
          set({ status: 'playing' });
        })
        .catch((error) => {
          console.error('Error resuming playback:', error);
          set({ status: 'error' });
        });
      return;
    }
    
    // For all other states, we need to request a token
    // but we'll let the controller component handle that
  },
  
  // Seek to specific time
  seek: (time) => {
    const audio = getAudioElement();
    if (isFinite(time) && time >= 0) {
      audio.currentTime = Math.min(time, audio.duration || 0);
      set({ currentTime: audio.currentTime });
    }
  },
  
  // Play next track in playlist
  nextTrack: () => {
    const { currentTrack, playlist, playTrack } = get();
    if (!currentTrack || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(track => track.id === currentTrack.id);
    if (currentIndex === -1 || currentIndex === playlist.length - 1) {
      // Play first track if at end or not found
      if (playlist.length > 0) {
        playTrack(playlist[0]!);
      }
    } else {
      playTrack(playlist[currentIndex + 1]!);
    }
  },
  
  // Play previous track in playlist
  previousTrack: () => {
    const { currentTrack, playlist, playTrack } = get();
    if (!currentTrack || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(track => track.id === currentTrack.id);
    if (currentIndex <= 0) {
      // Play last track if at beginning or not found
      if (playlist.length > 0) {
        playTrack(playlist[playlist.length - 1]!);
      }
    } else {
      playTrack(playlist[currentIndex - 1]!);
    }
  },
  
  // Set volume and persist to local storage
  setVolume: (volume) => {
    const audio = getAudioElement();
    const clampedVolume = Math.max(0, Math.min(1, volume));
    audio.volume = clampedVolume;
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerVolume', clampedVolume.toString());
    }
    
    set({ 
      volume: clampedVolume,
      isMuted: clampedVolume === 0
    });
  },
  
  // Toggle mute state
  toggleMute: () => {
    const { isMuted, volume } = get();
    const audio = getAudioElement();
    
    if (isMuted) {
      // Unmute: restore previous volume if it was > 0
      audio.muted = false;
      if (volume === 0) {
        get().setVolume(0.5); // Default volume if previous was 0
      }
    } else {
      // Mute: keep volume setting but mute audio
      audio.muted = true;
    }
    
    set({ isMuted: !isMuted });
  },
  
  // Set playlist tracks
  setPlaylist: (tracks) => {
    set({ playlist: tracks });
  }
}));

// Hook to set up audio events
export function useAudioEvents() {
  const {
    setVolume,
    nextTrack,
  } = usePlayerStore(state => ({
    setVolume: state.setVolume,
    nextTrack: state.nextTrack,
  }));
  
  useEffect(() => {
    const audio = getAudioElement();
    
    // Sync volume from localStorage on mount
    const storedVolume = localStorage.getItem('playerVolume');
    if (storedVolume) {
      setVolume(parseFloat(storedVolume));
    }
    
    // Set up event listeners
    const handleTimeUpdate = () => {
      usePlayerStore.setState({ currentTime: audio.currentTime });
    };
    
    const handleDurationChange = () => {
      usePlayerStore.setState({ duration: isFinite(audio.duration) ? audio.duration : 0 });
    };
    
    const handlePlay = () => {
      usePlayerStore.setState({ status: 'playing' });
    };
    
    const handlePause = () => {
      // Only update state if we're not in loading status
      // This prevents flickering when loading a new track
      if (usePlayerStore.getState().status !== 'loading') {
        usePlayerStore.setState({ status: 'paused' });
      }
    };
    
    const handleEnded = () => {
      nextTrack();
    };
    
    const handleError = (e: Event) => {
      console.error('Audio element error:', e);
      // Only update state if we're not already in error status
      // This prevents error toast loops
      if (usePlayerStore.getState().status !== 'error') {
        usePlayerStore.setState({ status: 'error' });
        toast.error('Playback error occurred');
      }
    };
    
    const handleVolumeChange = () => {
      usePlayerStore.setState({ 
        volume: audio.volume,
        isMuted: audio.muted 
      });
    };
    
    // Add all event listeners
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('volumechange', handleVolumeChange);
    
    // Cleanup function
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [setVolume, nextTrack]);
  
  return null;
}

// MediaSession API support
export function useMediaSession() {
  const { 
    currentTrack, 
    status, 
    togglePlay, 
    nextTrack, 
    previousTrack, 
    seek 
  } = usePlayerStore(state => ({
    currentTrack: state.currentTrack,
    status: state.status,
    togglePlay: state.togglePlay,
    nextTrack: state.nextTrack,
    previousTrack: state.previousTrack,
    seek: state.seek
  }));
  
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    
    // Update metadata when track changes
    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.userId || 'Unknown Artist',
        album: currentTrack.albumId || '',
        artwork: currentTrack.artworkUrl 
          ? [{ src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/jpeg' }] 
          : []
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
    
    // Update playback state
    navigator.mediaSession.playbackState = 
      status === 'playing' ? 'playing' : 
      status === 'paused' ? 'paused' : 'none';
    
    // Set up handlers
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => previousTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });
    
    // Cleanup
    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [currentTrack, status, togglePlay, nextTrack, previousTrack, seek]);
}

// Keyboard navigation support
export function useKeyboardControls() {
  const { 
    togglePlay, 
    nextTrack, 
    previousTrack 
  } = usePlayerStore(state => ({
    togglePlay: state.togglePlay,
    nextTrack: state.nextTrack,
    previousTrack: state.previousTrack
  }));
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only apply when not typing in form elements
      if (e.target instanceof HTMLInputElement || 
          e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case ' ': // Space bar toggles play/pause
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            nextTrack();
          }
          break;
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            previousTrack();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [togglePlay, nextTrack, previousTrack]);
}

// Main playback controller component
export function PlayerController({ userId }: { userId: string | undefined }) {
  // Set up audio events
  useAudioEvents();
  // Set up media session
  useMediaSession();
  // Set up keyboard controls
  useKeyboardControls();
  
  // Refs to manage token request state
  const requestInProgressRef = useRef(false);
  const lastRequestedTrackIdRef = useRef<string | null>(null);
  
  // Get state and actions from store
  const {
    currentTrack,
    status
  } = usePlayerStore(state => ({
    currentTrack: state.currentTrack,
    status: state.status
  }));
  
  // Set up the token request mutation
  const tokenMutation = api.stream.getPlaybackToken.useMutation({
    onMutate: () => {
      // Mark that a request is in progress
      requestInProgressRef.current = true;
      if (currentTrack) {
        lastRequestedTrackIdRef.current = currentTrack.id;
      }
    },
    onSuccess: (data) => {
      if (!currentTrack) return;
      
      // Skip if this is not for the current track
      if (lastRequestedTrackIdRef.current !== currentTrack.id) {
        console.log('Ignoring token for outdated track request');
        return;
      }
      
      // Reset request state
      requestInProgressRef.current = false;
      
      const audio = getAudioElement();
      const streamUrl = `http://localhost:4000/tracks/stream/${currentTrack.id}?token=${data.token}`;
      
      // Set the audio source
      audio.src = streamUrl;
      audio.load();
      
      // Start playback if we were in loading state
      if (status === 'loading') {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              usePlayerStore.setState({ status: 'playing' });
            })
            .catch((error) => {
              console.error('Error playing audio:', error);
              if (error.name !== 'AbortError') {
                toast.error('Failed to play track');
                usePlayerStore.setState({ status: 'error' });
              }
            });
        }
      } else {
        usePlayerStore.setState({ status: 'paused' });
      }
    },
    onError: (error) => {
      // Reset request state
      requestInProgressRef.current = false;
      
      console.error('Failed to get playback token:', error);
      toast.error('Failed to get playback token');
      usePlayerStore.setState({ status: 'error' });
    }
  });
  
  // Request token when track changes
  useEffect(() => {
    // Only proceed if:
    // 1. We have a current track
    // 2. We have a user ID
    // 3. We're in loading state
    // 4. There's no request already in progress
    // 5. This is a different track than the last requested one
    if (
      currentTrack && 
      userId && 
      status === 'loading' && 
      !requestInProgressRef.current &&
      lastRequestedTrackIdRef.current !== currentTrack.id
    ) {
      console.log(`Requesting token for track: ${currentTrack.id}`);
      tokenMutation.mutate({ trackId: currentTrack.id });
    }
  }, [currentTrack, userId, status, tokenMutation]);
  
  return null;
} 