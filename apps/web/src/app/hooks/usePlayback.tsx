'use client';

import type { Track } from '@prisma/client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  useRef,
  useCallback,
} from 'react';
import { api } from '@/trpc/react';
import { toast } from 'sonner';

type Panel = 'sidebar' | 'tracklist';

type PlaybackContextType = {
  isPlaying: boolean;
  currentTrack: Track | null;
  currentTime: number;
  duration: number;
  togglePlayPause: () => void;
  playTrack: (track: Track) => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaylist: (songs: Track[]) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  activePanel: Panel;
  setActivePanel: (panel: Panel) => void;
  registerPanelRef: (panel: Panel, ref: React.RefObject<HTMLElement>) => void;
  handleKeyNavigation: (e: React.KeyboardEvent, panel: Panel) => void;
  audioSrc: string | undefined;
};

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined
);

function useKeyboardNavigation() {
  const [activePanel, setActivePanel] = useState<Panel>('sidebar');
  const panelRefs = useRef<Record<Panel, React.RefObject<HTMLElement> | null>>({
    sidebar: null,
    tracklist: null,
  });

  const registerPanelRef = useCallback(
    (panel: Panel, ref: React.RefObject<HTMLElement>) => {
      panelRefs.current[panel] = ref;
    },
    []
  );

  const handleKeyNavigation = useCallback(
    (e: React.KeyboardEvent, panel: Panel) => {
      const currentRef = panelRefs.current[panel];
      if (!currentRef?.current) return;

      const items = Array.from(
        currentRef.current.querySelectorAll('[tabindex="0"]')
      );
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % items.length;
          (items[nextIndex] as HTMLElement).focus();
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          (items[prevIndex] as HTMLElement).focus();
          break;
        case 'h':
          if (panel === 'tracklist') {
            e.preventDefault();
            setActivePanel('sidebar');
            const sidebarFirstItem =
              panelRefs.current.sidebar?.current?.querySelector(
                '[tabindex="0"]'
              ) as HTMLElement | null;
            sidebarFirstItem?.focus();
          }
          break;
        case 'l':
          if (panel === 'sidebar') {
            e.preventDefault();
            setActivePanel('tracklist');
            const tracklistFirstItem =
              panelRefs.current.tracklist?.current?.querySelector(
                '[tabindex="0"]'
              ) as HTMLElement | null;
            tracklistFirstItem?.focus();
          }
          break;
      }
    },
    []
  );

  return { activePanel, setActivePanel, registerPanelRef, handleKeyNavigation };
}

export function PlaybackProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | undefined;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined);
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);

  const { activePanel, setActivePanel, registerPanelRef, handleKeyNavigation } =
    useKeyboardNavigation();

  const getPlaybackTokenMutation = api.stream.getPlaybackToken.useMutation({
    onSuccess: (data) => {
      console.log('Received playback token:', data.token);
      setPlaybackToken(data.token);
      if (currentTrack) {
        const newAudioSrc = `http://localhost:4000/tracks/stream/${currentTrack.id}?token=${data.token}`;
        setAudioSrc(newAudioSrc);
        if (audioRef.current) {
          audioRef.current.src = newAudioSrc;
          audioRef.current.load();
          audioRef.current
            .play()
            .catch((error) => console.error('Audio play error:', error));
          setIsPlaying(true);
        }
      }
    },
    onError: (error) => {
      console.error('Failed to get playback token:', error);
      toast.error('Failed to get playback token. Please try again.');
      setPlaybackToken(null);
      setAudioSrc(undefined);
      setIsPlaying(false);
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error('You are not authorized to play this track.');
      }
    },
  });

  const togglePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (audioSrc && currentTrack) {
          audioRef.current
            .play()
            .catch((error) => console.error('Audio play error:', error));
        }
      }
      if (currentTrack) {
        setIsPlaying(!isPlaying);
      }
    }
  }, [isPlaying, audioSrc, currentTrack]);

  const playTrack = useCallback(
    (track: Track) => {
      console.log('🚩 playTrack called with:', track);
      setCurrentTrack(track);
      setIsPlaying(false);
      setCurrentTime(0);
      setAudioSrc(undefined);
      setPlaybackToken(null);

      if (userId && track.id) {
        console.log(`Fetching token for track: ${track.id}`);
        getPlaybackTokenMutation.mutate({ trackId: track.id });
      } else {
        console.log('User not logged in or no track ID, cannot fetch token.');
        toast.error(
          'Please log in to play tracks.'
        );
      }
      setActivePanel('tracklist');
    },
    [setActivePanel, userId, getPlaybackTokenMutation]
  );

  const playNextTrack = useCallback(() => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (track) => track?.id === currentTrack.id
      );
      const nextIndex = (currentIndex + 1) % playlist.length;
      playTrack(playlist[nextIndex] as Track);
    }
  }, [currentTrack, playlist, playTrack]);

  const playPreviousTrack = useCallback(() => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (track) => track?.id === currentTrack.id
      );
      const previousIndex =
        (currentIndex - 1 + playlist.length) % playlist.length;
      playTrack(playlist[previousIndex] as Track);
    }
  }, [currentTrack, playlist, playTrack]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target === document.body && currentTrack) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[type="search"]'
        ) as HTMLInputElement | null;
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [togglePlayPause, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        setDuration(0);
        console.warn("Received infinite or invalid duration.");
      }
    }
    const handleEnded = () => {
      setIsPlaying(false);
      playNextTrack();
    };
    const handleError = (e: Event) => {
        console.error("Audio Error:", e);
        const mediaError = (e.target as HTMLAudioElement).error;
        if (mediaError) {
            let errorMsg = `Audio error code: ${mediaError.code}.`;
            switch (mediaError.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    errorMsg += " Playback aborted by the user or script.";
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    errorMsg += " Network error caused download to fail.";
                    toast.error("Network error playing track. Check connection.");
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    errorMsg += " Decoding error during playback.";
                    toast.error("Error decoding audio track.");
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMsg += " Audio source format not supported.";
                    toast.error("Audio format not supported.");
                    break;
                default:
                    errorMsg += " An unknown error occurred.";
            }
             console.error(errorMsg);
        } else {
            toast.error("An unknown audio error occurred.");
        }
        setIsPlaying(false);
        setAudioSrc(undefined);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);


    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioRef, setCurrentTime, setDuration, playNextTrack, userId, currentTrack?.id]);


  return (
    <PlaybackContext.Provider
      value={{
        isPlaying,
        currentTrack,
        currentTime,
        duration,
        togglePlayPause,
        playTrack,
        playNextTrack,
        playPreviousTrack,
        setCurrentTime,
        setDuration,
        setPlaylist,
        audioRef: audioRef as React.RefObject<HTMLAudioElement>,
        activePanel,
        setActivePanel,
        registerPanelRef,
        handleKeyNavigation,
        audioSrc,
      }}
    >
      {children}
      <audio ref={audioRef} preload="metadata" />
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (context === undefined) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}
