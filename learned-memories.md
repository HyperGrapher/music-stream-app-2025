# Project Memory

This file stores project-specific knowledge, conventions, and user preferences learned by the AI assistant.

## Technical Decisions

- **Playback System**: The playback system uses Zustand for state management with a central store in `apps/web/src/store/playback.tsx`. 
  - When a track is clicked, the `playTrack` function should set `isPlaying: true` to indicate intent to play, which triggers the token request flow.
  - The playback initialization flow: `playTrack` sets the track and isPlaying → PlaybackInitializer requests token → token sets audioSrc → audioSrc change triggers actual audio playback.
  - Track switching requires properly resetting the audio source (audio.src = '') and tracking track ID changes to ensure proper mutation resets.
  - Mutation resets must be throttled to prevent infinite loops.

## Bug Fixes

- **Issue**: Fixed infinite re-renders by removing console.log statements that were causing memoized components to re-render unnecessarily.
- **Issue**: Fixed playback issues where tracks could only be played once after page reload by ensuring `playTrack` sets `isPlaying: true` instead of `false`.
- **Issue**: Fixed track switching issues by adding track ID change detection in the PlaybackInitializer and clearing the audio source when switching tracks.
- **Issue**: Fixed infinite mutation reset loops by adding throttling and flags to prevent multiple resets. 