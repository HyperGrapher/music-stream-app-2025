'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useOptimistic,
  use,
  type ReactNode,
} from 'react';

type Playlist = {
  id: string;
  name: string;
  coverUrl: string;
  createdAt: Date;
  updatedAt: Date;
};


type PlaylistContextType = {
  playlists: Playlist[];
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  deletePlaylist: (id: string) => void;
};

const PlaylistContext = createContext<PlaylistContextType | undefined>(
  undefined
);

type OptimisticAction =
  | { type: 'update'; id: string; updates: Partial<Playlist> }
  | { type: 'delete'; id: string };

export function PlaylistProvider({
  children,
  playlistsPromise,
}: {
  children: ReactNode;
  playlistsPromise: Promise<Playlist[]>;
}) {
  const initialPlaylists = use(playlistsPromise);

  const [playlists, setOptimisticPlaylists] = useOptimistic(
    initialPlaylists,
    (state: Playlist[], action: OptimisticAction) => {
      switch (action.type) {
        case 'update':
          return state.map((playlist) =>
            playlist.id === action.id
              ? { ...playlist, ...action.updates }
              : playlist
          );
        case 'delete':
          return state.filter((playlist) => playlist.id !== action.id);
        default:
          return state;
      }
    }
  );

  const updatePlaylist = useCallback(
    (id: string, updates: Partial<Playlist>) => {
      setOptimisticPlaylists({ type: 'update', id, updates });
    },
    [setOptimisticPlaylists],
  );

  const deletePlaylist = useCallback(
    (id: string) => {
      setOptimisticPlaylists({ type: 'delete', id });
    },
    [setOptimisticPlaylists],
  );

  const value = useMemo(
    () => ({
      playlists,
      updatePlaylist,
      deletePlaylist,
    }),
    [playlists, updatePlaylist, deletePlaylist]
  );

  return (
    <PlaylistContext.Provider value={value}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error('usePlaylist must be used within a PlaylistProvider');
  }
  return context;
}
