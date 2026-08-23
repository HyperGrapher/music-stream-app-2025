# Codex handover: SoundCloud-like streaming app

Date: 2026-08-24

## User intent and constraints

- This turborepo is becoming a music streaming application similar to SoundCloud.
- Read `learned-memories.md` and inspect the current code before making broader product decisions.
- The user asked to implement needed work, not only report recommendations.
- Do not run TypeScript/typecheck unless the user explicitly changes that instruction.
- The app was running with `turbo dev`: Next.js at `http://localhost:3000` and Express at `http://localhost:4000`. Verify the processes before starting duplicates.
- Preserve the current uncommitted changes. They were produced during the preceding session and have not been committed.

## Work completed

### Streaming API security and correctness

- `apps/express/src/routes/stream-r2.ts`
  - Replaced storage-key-based streaming with `GET /tracks/stream/:trackId`.
  - Resolves the private R2 `storageKey` server-side from a public UUID track ID.
  - Streams only records where `isPrivate: false`.
  - Added UUID validation to protect the waveform filesystem lookup and public metadata route.
  - Uses R2 `HeadObjectCommand` and `GetObjectCommand` with exact byte ranges.
  - Returns `206` for valid ranges and standards-compatible `416` responses for invalid ranges.
  - Public metadata returns only `id`, `title`, `duration`, `artworkUrl`, and `waveformData`.
- `apps/express/src/helpers/stream-utils.ts`
  - Added strict single-range parsing, suffix range support, safe bounds checks, and `RangeNotSatisfiableError`.
  - Keeps the existing 500 KB chunk cap while fixing inclusive end calculations.
- `apps/express/src/routes/index.ts`
  - Removed the unauthenticated `/tracks` database dump.
  - Removed the arbitrary `/stream-error` endpoint.
  - The old `/tracks/stream?key=...` route is no longer exposed.
- `apps/web/src/server/api/routers/artist.ts` and `apps/web/src/app/(player)/p/[id]/page.tsx`
  - Removed public/client `storageKey` exposure.

### Player state-machine fixes

- `apps/web/src/store/player.tsx`
  - Streams by public track ID using optional `NEXT_PUBLIC_STREAM_API_URL`, defaulting to `http://localhost:4000`.
  - Fixed same-track retry/replay after errors and track end.
  - Allows playback loading to be cancelled.
  - Fixed continuous queue advancement and end-of-queue behavior; manual Next at the final track no longer lies about pausing while audio continues.
  - Previous restarts after three seconds or moves to the prior queued track.
  - Added queued seeking while metadata is loading, removing timing assumptions.
  - Fixed mute/volume desynchronization and validates persisted volume values.
  - Media Session play and pause now call the correct actions instead of both toggling.
  - Ignores global keyboard shortcuts while an interactive/editable element is focused.
  - Guards media events against stale sources during rapid track changes.
  - Guards stale `audio.play()` promise rejections.
  - Added shallow Zustand comparisons so controller hooks do not rerender for every time update.
- `apps/web/src/app/_components/WaveformTrackItem.tsx`
  - Replaced the 100 ms seek timeout with the player's pending-seek mechanism.
  - Validates parsed waveform JSON and uses a safe fallback.
- `apps/web/src/app/(player)/p/[id]/track-table.tsx`
  - Entire rows are clickable and keyboard accessible without double-triggering nested buttons.
  - Corrected paused/current play icons.
  - Removed dead selection/focus state and the `| any` playlist type escape.
- `apps/web/src/app/_components/GlobalPlaybackControls.tsx`
  - Clamps progress width and includes small player-related cleanup.

## Verification completed

- `GET http://localhost:3000/Hypergraph` returned `200` after the final edits.
- `GET http://localhost:3000/p/1` returned `200` after the final edits.
- `Range: bytes=0-99` against a real public track returned `206`, `Content-Range: bytes 0-99/1145001`, and 100 bytes.
- An out-of-bounds range returned `416` with `Content-Range: bytes */1145001`.
- The removed key-based stream route returned `404`.
- The removed public `/tracks` dump returned `404`.
- Public artist HTML and track metadata did not contain `storageKey`.
- `git diff --check` passed; it only printed CRLF/LF conversion warnings for two files.
- The edited player files parsed successfully through Prettier. The repository's existing formatting differs from current Prettier output, so `--write` was intentionally not used to avoid large unrelated churn.
- Focused ESLint could not complete because the installed dependency tree is missing `eslint-plugin-react-hooks`.
- Type checking was intentionally skipped at the user's request.
- The in-app browser failed to initialize under the previous Windows sandbox, so real click/audio interaction was not automated. Perform a manual browser playback pass in the new unrestricted session.

## Current worktree

Nine implementation files are modified, plus this handover file is new:

- `apps/express/src/helpers/stream-utils.ts`
- `apps/express/src/routes/index.ts`
- `apps/express/src/routes/stream-r2.ts`
- `apps/web/src/app/(player)/p/[id]/page.tsx`
- `apps/web/src/app/(player)/p/[id]/track-table.tsx`
- `apps/web/src/app/_components/GlobalPlaybackControls.tsx`
- `apps/web/src/app/_components/WaveformTrackItem.tsx`
- `apps/web/src/server/api/routers/artist.ts`
- `apps/web/src/store/player.tsx`
- `HANDOVER.md`

Do not discard or overwrite these edits. Review the diff before building on them.

## Recommended next work

1. Manually exercise play, pause, waveform seek on a newly selected track, rapid track switching, mute then volume adjustment, Previous, Next, automatic queue advancement, final-track replay, and Media Session controls.
2. Harden upload ownership in `apps/web/src/server/api/routers/upload.ts`:
   - `cancelUpload` must prove the pending upload belongs to the authenticated user.
   - `createTrack` must bind the submitted storage key to that user's completed temporary upload.
   - `getDownloadUrl` must not sign arbitrary keys.
   - Use transactions/cleanup so database and R2 state cannot drift.
3. Add authenticated owner access for private-track playback. The current safe baseline deliberately returns `404` for every private track.
4. Move waveform and authoritative duration extraction into background media processing after upload. `TODO.md` mentions `audiowaveform` and the existing R2 chunk workaround.
5. Replace placeholder feed/discover/library/for-artists surfaces and hard-coded playlist data with database-backed features.
6. Consolidate duplicated Prisma schemas/migrations and add focused tests for range parsing, stream authorization, player transitions, and upload ownership.

## Suggested fresh-session prompt

> Read `HANDOVER.md`, `learned-memories.md`, and the current Git diff. Do not run typecheck. Verify the running servers without starting duplicates, manually test the player in the browser, fix any confirmed regressions, then start hardening upload ownership in `apps/web/src/server/api/routers/upload.ts`. Preserve all existing uncommitted changes.
