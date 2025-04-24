# Project Memory

This file stores project-specific knowledge, conventions, and user preferences learned by the AI assistant.

## Technical Decisions

- **Player System**: The audio playback system uses a clean state management approach with Zustand in `apps/web/src/store/player.tsx`.
  - The player has distinct states: 'idle', 'loading', 'playing', 'paused', and 'error'.
  - The single global audio element is managed outside of React's lifecycle.
  - Uses a controller component pattern with token requests separated from the UI components.
  - Key components: `usePlayerStore`, `PlayerController`, `useAudioEvents`, `useMediaSession`, and `useKeyboardControls`.
  - Playback state persists volume settings to localStorage.

- **Authentication**: 
  - User authentication is implemented using `better-auth` library.
  - The user state is globally managed with Zustand via the `useUserStore` and accessible through the `useUser` hook.
  - Auth state changes are tracked using the `authClient.useSession()` hook in the AuthProvider component.
  - The `useUser` hook provides unified access to both user data and auth methods (signIn, signUp, signOut).

- **User State Management**: 
  - Server-side authentication data hydrates both the UI components directly and the client-side Zustand store.
  - Server components pass user data to client components via props to prevent layout shifts.
  - Client components prioritize server-provided props for initial render, then switch to the store.
  - The pattern uses a server wrapper + client component approach (e.g., `ServerNavbar` + `Navbar`).
  - User state is persisted in sessionStorage for page refreshes.

- **User Access Pattern**: 
  - Components can access the current user through the `useUser()` hook
  - The hook provides `{ user, isLoading, isAuthenticated, signIn, signUp, signOut }` properties and methods
  - Centralizes auth logic and prevents repetitive imports of authClient across components

## Design Patterns

- **Audio Playback Flow**: 
  1. User selects a track → `playTrack` is called
  2. Track state is updated in the store and status set to 'loading' 
  3. `PlayerController` detects loading state and requests a token
  4. On success, audio source is set and playback begins
  5. Audio events update the store state (time updates, etc.)

- **Component Structure**:
  - Separation of playback logic (`store/player.tsx`) from UI components
  - Memoized components to prevent unnecessary re-renders
  - Media Session API integration for OS-level media controls
  - Keyboard controls for playback
  
- **Server-Side Rendering Pattern**:
  - Server components fetch authentication data and pass it to client components
  - Client components use the pattern: `const displayData = clientData || serverData`
  - This ensures immediate correct rendering without waiting for client-side hydration

- **Authentication Flow**:
  1. Server-side: Initial user data fetched on the server and passed to client
  2. Client-side: AuthProvider initializes store with server data, then listens for auth changes
  3. UI components access auth state through the useUser hook
  4. Auth actions (sign in/out) update the global store via store subscriptions

## Bug Fixes

- **Issue**: Fixed infinite re-renders by removing console.log statements that were causing memoized components to re-render unnecessarily.
- **Issue**: Fixed playback issues where tracks could only be played once after page reload by ensuring `playTrack` sets `isPlaying: true` instead of `false`.
- **Issue**: Fixed track switching issues by adding track ID change detection in the PlaybackInitializer and clearing the audio source when switching tracks.
- **Issue**: Fixed infinite mutation reset loops by adding throttling and flags to prevent multiple resets.
- **Issue**: Completely redesigned the playback system to eliminate previous architectural problems and provide a more robust solution. 
- **Issue**: Fixed layout shift in Navbar by implementing server-side rendering with direct prop passing instead of relying solely on client-side state hydration. 
- **Issue**: Fixed auth state synchronization using the `authClient.useSession()` hook in the AuthProvider to detect changes like sign-outs. 