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

### Upload ownership and consistency hardening

- `apps/web/src/server/api/routers/upload.ts`
  - Audio storage keys are randomized and sanitized on the server; the browser no longer supplies a storage key when completing, canceling, or creating a track.
  - `markUploadComplete` resolves an authenticated user's temporary upload and verifies the R2 object exists, is non-empty, is at most 50 MB, and has an allowed audio MIME type.
  - `createTrack` atomically claims one owned completed temporary upload and creates the track from its server-side storage fields.
  - `createAlbum` rejects duplicate temporary IDs and atomically claims every owned completed upload, preventing partial albums or cross-user adoption.
  - `cancelUpload` claims only the caller's temporary row before deleting R2 data, preventing finalize/cancel races. It restores the row if storage deletion fails so cancellation can be retried.
  - `getDownloadUrl` accepts an owned track ID instead of signing an arbitrary caller-supplied R2 key.
  - Artwork URLs now require an explicit `R2_PUBLIC_BASE_URL`; the previous generated `*.r2.cloudflarestorage.com` hostname was not a valid R2 public URL.
- Upload UI/store
  - Presign failures now enter a removable error state instead of remaining stuck as “uploading”.
  - The store keeps real browser `File` instances and no longer keeps or trusts R2 storage keys.
  - Duplicate filenames and Back-to-file-step navigation no longer disconnect the displayed file from its temporary upload.
  - Artwork requests include file size, and successful artwork URLs are now submitted with tracks/albums.
  - Removed the custom-link and scheduled-release controls because neither behavior is represented or persisted by the current data model.

## Verification completed

- `GET http://localhost:3000/Hypergraph` returned `200` after the final edits.
- `GET http://localhost:3000/p/1` returned `200` after the final edits.
- `GET http://localhost:3000/upload` returned `200` after the upload edits.
- `GET http://localhost:4000/` and `/api/version` both returned `200`.
- `Range: bytes=0-99` against a real public track returned `206`, `Content-Range: bytes 0-99/1145001`, and 100 bytes.
- An out-of-bounds range returned `416` with `Content-Range: bytes */1145001`.
- The removed key-based stream route returned `404`.
- The removed public `/tracks` dump returned `404`.
- Public artist HTML and track metadata did not contain `storageKey`.
- `git diff --check` passed; it only printed CRLF/LF conversion warnings for two files.
- The edited player files parsed successfully through Prettier. The repository's existing formatting differs from current Prettier output, so `--write` was intentionally not used to avoid large unrelated churn.
- Focused ESLint could not complete because the installed dependency tree is missing `eslint-plugin-react-hooks`.
- Type checking was intentionally skipped at the user's request.
- The Browser integration reported no available browser instance even in the unrestricted session, so real click/audio/upload interaction was not automated.
- The edited upload sources parsed successfully through Prettier. Existing repository formatting still differs from current Prettier output, so `--write` was not used.

## Current worktree

The current uncommitted diff is the upload hardening across these 11 files, plus this handover update:

- `apps/web/.env.example`
- `apps/web/src/components/upload/ArtworkUpload.tsx`
- `apps/web/src/components/upload/DetailStepForm.tsx`
- `apps/web/src/components/upload/FileStepForm.tsx`
- `apps/web/src/components/upload/MultipleTrackForm.tsx`
- `apps/web/src/components/upload/SingleTrackForm.tsx`
- `apps/web/src/components/upload/index.tsx`
- `apps/web/src/components/upload/schema.ts`
- `apps/web/src/env.js`
- `apps/web/src/server/api/routers/upload.ts`
- `apps/web/src/store/uploadStore.ts`

Do not discard or overwrite these edits. Review the diff before building on them.

## Recommended next work

1. Add the bucket's Cloudflare public development URL or custom domain as `R2_PUBLIC_BASE_URL` in `apps/web/.env`, restart `turbo dev`, then manually test single-track and multi-track upload, artwork, removal, Back/Continue, and a deliberately failed upload. Cloudflare's S3 API endpoint is not a public object URL.
2. Manually exercise play, pause, waveform seek on a newly selected track, rapid track switching, mute then volume adjustment, Previous, Next, automatic queue advancement, final-track replay, and Media Session controls.
3. Replace the dead `cleanupTemporaryUploads` admin stub with a scheduled cleanup job that deletes both stale database rows and their R2 objects. Artwork also needs a temporary ownership record/cancellation path to avoid orphaned images.
4. Add authenticated owner access for private-track playback. The current safe baseline deliberately returns `404` for every private track.
5. Move waveform and authoritative duration extraction into background media processing after upload. `TODO.md` mentions `audiowaveform` and the existing R2 chunk workaround.
6. Add focused tests for range parsing, stream authorization, player transitions, upload ownership/races, and album rollback, then consolidate the duplicated Prisma schemas/migrations.

## Suggested fresh-session prompt

> Read `HANDOVER.md`, `learned-memories.md`, and the current Git diff. Do not run typecheck. Preserve all existing uncommitted changes. Configure `R2_PUBLIC_BASE_URL`, restart the existing `turbo dev` process, manually exercise the upload flow and player in a browser, and fix confirmed regressions. Then implement stale R2/temp-upload cleanup and authenticated owner playback for private tracks.
