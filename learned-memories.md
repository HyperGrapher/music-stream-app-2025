# Project Memory

This file stores project-specific knowledge, conventions, and user preferences learned by the AI assistant.

## Technical Decisions

- **Player System**: The audio playback system uses a clean state management approach with Zustand in `apps/web/src/store/player.tsx`.
  - The player has distinct states: 'idle', 'loading', 'playing', 'paused', and 'error'.
  - The single global audio element is managed outside of React's lifecycle.
  - Uses a controller component pattern with token requests separated from the UI components.
  - Key components: `usePlayerStore`, `PlayerController`, `useAudioEvents`, `useMediaSession`, and `useKeyboardControls`.
  - Playback state persists volume settings to localStorage.

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

## Bug Fixes

- **Issue**: Fixed infinite re-renders by removing console.log statements that were causing memoized components to re-render unnecessarily.
- **Issue**: Fixed playback issues where tracks could only be played once after page reload by ensuring `playTrack` sets `isPlaying: true` instead of `false`.
- **Issue**: Fixed track switching issues by adding track ID change detection in the PlaybackInitializer and clearing the audio source when switching tracks.
- **Issue**: Fixed infinite mutation reset loops by adding throttling and flags to prevent multiple resets.
- **Issue**: Completely redesigned the playback system to eliminate previous architectural problems and provide a more robust solution. 