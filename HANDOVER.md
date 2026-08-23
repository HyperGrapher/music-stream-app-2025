# Codex handover: SoundCloud-like streaming app

Date: 2026-08-24

## Constraints

- Do not run TypeScript/typecheck unless the user changes this instruction.
- Preserve the uncommitted worktree.
- The user explicitly permits resetting the local database and prefers clean designs over compatibility shims.
- `turbo dev` is expected to serve Next on `http://localhost:3000` and Express on `http://localhost:4000`.

## Current architecture

- `apps/web/prisma/schema.prisma` is the canonical schema for both apps. Express Prisma scripts explicitly target it; the duplicate Express schema was removed.
- `MediaAsset` owns R2 metadata and has `PENDING -> READY -> ATTACHED` lifecycle states plus cleanup states.
- `Track` references one audio asset and optional artwork asset. Storage keys are no longer copied onto tracks.
- `Release` replaces the generic `Album` database concept, with ordered `ReleaseTrack` membership.
- Playlists have independent ordered membership.
- `Visibility` replaces privacy booleans.
- Likes and reposts use target-specific tables instead of nullable polymorphic rows.
- `PlayEvent`, threaded comments/comment likes, and append-only `MediaProcessingError` records replace the old loose models.
- Auth models remain Better Auth-compatible.
- Domain language is recorded in `CONTEXT.md`; the decision is in `docs/adr/0001-normalized-media-and-content-relations.md`.

## Implemented behavior

- Upload presigning creates an owned media asset; the client receives only its UUID and signed URL.
- Completion verifies the actual R2 object size and MIME type before changing the asset to `READY`.
- Track/release publication atomically claims `READY` assets and marks them `ATTACHED`.
- Cancellation and owner-scoped expiry cleanup atomically claim assets before deleting R2 objects.
- Artwork follows the same lifecycle and stores its configured public URL on the asset.
- Artwork uploads do not require `R2_PUBLIC_BASE_URL`; when it is absent, Express serves attached artwork through `/tracks/:trackId/artwork`.
- Express streaming resolves bucket/key through `Track.audioAsset` and only serves public tracks.
- Artist queries map relational artwork to the existing `artworkUrl` UI DTO.
- Player components now use `PlayerTrack`, a stable client DTO, rather than Prisma's persistence record.
- Profile track items seed the player queue for All, Popular, Tracks, and Release tabs, enabling global Next/Previous and automatic queue advancement.
- Artist profiles now expose public releases with ordered tracks through `artist.getReleases`; `/u/{userId}` is the stable profile route for names containing spaces or punctuation.
- The starter `Post` router/pages and unused hardcoded auth demo were removed.
- Better Auth now supports Google and email/password. The browser client uses same-origin auth endpoints.
- Authenticated `/profile` redirects to the stable `/u/{userId}` route, so display names containing spaces or dots do not break navigation.

## Database state

- Local PostgreSQL database `streamapp`, schema `stream`, was force-reset and pushed successfully.
- Seed creates three creator profiles and deliberately creates no fake tracks with nonexistent media.
- A real Google login was subsequently confirmed by the user; the database showed one provider account and one session.

## Verification

- Prisma schema validates from both web and Express.
- Prisma Client regenerated successfully after restarting the dev processes to release the Windows DLL lock.
- Router modules load successfully with the app environment.
- Upload lifecycle tests pass: 4/4.
- Disposable email signup, sign-out, and sign-in each returned HTTP 200; the disposable user was deleted afterward.
- User confirmed Google sign-in works after regeneration/restart.
- `/`, `/burak`, `/upload`, Express `/`, and `/api/version` return HTTP 200.
- Type checking was intentionally skipped.

## Next work

1. Upload one real audio file with artwork and publish it. If desired, configure `R2_PUBLIC_BASE_URL` later to use direct CDN URLs; the Express artwork proxy works without it.
2. Replace dummy 180-second duration and random waveform generation with background media processing that records results/errors against `MediaAsset`.
3. Add authorization semantics for private and unlisted playback; Express currently streams public tracks only.
4. Add integration tests for asset claim races, release rollback, stream visibility, and Better Auth account linking.
5. Continue the planned UI redesign once the first real uploaded track proves the new publishing pipeline.

## Suggested fresh-session prompt

> Read `HANDOVER.md`, `CONTEXT.md`, `learned-memories.md`, the ADR, and the current diff. Do not run typecheck. Preserve existing changes. Start by manually publishing a real track and artwork through `/upload`, verify it appears on the creator page, artwork loads through Express, and the `/profile` dropdown opens the signed-in profile at `/u/{userId}` before beginning UI redesign.
