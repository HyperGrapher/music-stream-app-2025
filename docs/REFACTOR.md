# Refactor: single Next.js app for Vercel + Neon

Living document. **Read this first in a new session**, then `CONTEXT.md`
and `docs/adr/`.

**Product scope:** the complete feature set to build next is specified in [`docs/PRD.md`](PRD.md)
(milestones M0–M8). Where the PRD and `CONTEXT.md` disagree, the PRD wins; update `CONTEXT.md` in M0. Update the checklist and the log at the end of every work session.

Working branch: **`dev`** (PRD implementation; push only to `origin/dev`). The older `refactor/single-nextjs-app` branch is history.

## PRD implementation: status and handoff (READ THIS FIRST IN A NEW SESSION)

Implementation of [`docs/PRD.md`](PRD.md) is in progress, milestone by milestone (PRD §19). Update this section at
the end of every work session (checklist + "Next up" + gotchas), and add a dated entry to the Log at the bottom.

**Owner decisions (apply to all milestones)**

- Global client state uses **zustand** (already installed); add libraries freely when they remove code.
- **Audio scope:** keep today's accepted formats (MP3 first; WAV/OGG/FLAC/AAC/M4A stay accepted as they are today). Do NOT add AIFF or other new formats (this narrows PRD UP-F1/§3.3).
- Code only on `origin/dev`. No PRs unless asked.
- When in doubt about product intent, ask the owner.

**Milestone checklist** (PRD §19)

| Milestone | State |
|---|---|
| M0 Foundation reset | **done** (see "M0 summary" below) |
| M1 Accounts & profiles | **next** (see "Next up") |
| M2 Upload & editing | not started |
| M3 Listening | not started |
| M4 Social loop | not started |
| M5 Discovery | not started |
| M6 Creator tools & plans | not started |
| M7 Trust & safety | not started |
| M8 Polish | not started |

**M0 summary: what exists now** (read these before starting M1)

| Area | Where | Notes |
|---|---|---|
| Schema (PRD §16, all models) | `prisma/schema.prisma`, one baseline `prisma/migrations/0_init` | CHECK constraints (username format, follow/block not self, collection date/visibility, spotlight target, counters >= 0) are hand-written at the end of the migration; `prisma migrate diff` sees no drift. Full-text/trigram search columns are NOT there yet (M5 adds them in a new migration). |
| Visibility (single source of truth) | `src/server/modules/visibility/index.ts` | `effectiveVisibility`, `publicTrackWhere/accessibleTrackWhere/publicCollectionWhere/accessibleCollectionWhere`, `trackAccess/collectionAccess`, secret tokens. Use these for EVERY listing/route; never hand-write visibility conditions. Track route handlers and procedures call `authorizeTrack` (`modules/tracks/authorize.ts`) and answer 404, never 403. |
| Names, slugs, reserved words | `src/lib/names.ts` | A unit test checks every first-level folder of `src/app` is reserved: adding a top-level route without adding it to `RESERVED_USERNAMES` fails CI. |
| Entitlements | `server/modules/plans/entitlements.ts` | Limits + `requireEntitlement` (throws `PLAN_REQUIRED`). Only upload size is enforced so far; upload-time quota (UP-8), scheduling, Quiet Mode etc. are enforced when their features land (M2/M6). |
| Rate limiter | `server/modules/rate-limit` | `enforceRateLimit(db, action, subject, ...rules)`, `RATE_LIMITS` mirrors PRD 14.3. Enforced today: comment (8/min, 200/day), like (60/min + 10 toggles/10 min per target, counted only when committed), upload URLs. Add the rest with their features. |
| Errors | `server/errors.ts` | `appError/planRequired/rateLimited` set `error.data.appCode` (+ `retryAfterSeconds`); the UI mapping to friendly text is still ad hoc (`useTrackLike`, `CommentsSection`): centralise it in M1/M2. |
| Email | `server/modules/email` | `sendEmail(db, mail)` -> Resend or stored as `LOGGED`; templates for verification and reset exist but Better Auth is NOT wired to send them yet (M1). |
| Storage deletion queue + daily cron | `server/modules/storage/deletion.ts`, `server/modules/housekeeping.ts`, `app/api/cron/daily`, `vercel.json` | Cancel/expire/image replacement enqueue keys and drain via `runAfter()` (`server/after.ts`). Cron today: expire unattached assets, drain queue, prune rate-limit buckets, email bodies, play events > 13 months, username redirects > 30 days. Account purge and digests come with M1/M4. `demo/` and `random-artwork-images/` are protected. |
| Image pipeline | `server/modules/media/artwork-processing.ts`, `src/lib/artwork.ts` (`IMAGE_SPECS`) | `processImageObject(r2, {purpose})` for ARTWORK / AVATAR / BANNER; `/api/images/[assetId]?w=` serves avatars, banners, collection artwork with access checks. No UI uploads avatars/banners yet (M1). |
| Publishing | `server/modules/publishing`, `server/api/routers/upload.ts` | `publishTrack`, `publishCollection` (atomic claim READY -> ATTACHED, slugs with -2/-3 and retry on a unique race, secret tokens, activities, `publicTrackCount`). `markUploadComplete` now REQUIRES the browser analysis. Procedures: `createTrack`, `createCollection` (replaces createRelease). The upload UI is still the old two-step form (M2 rebuilds it). |
| Routers | `server/api/routers/*` | `tracks.byPermalink`, `collections.byPermalink`, `profiles.{byUsername,tracks,collections}`, `discover`, `engagement.setTrackLike`, `comments`, `upload`. Old `artist` router is gone. Shared DTO builder: `modules/tracks/dto.ts` (`trackDtoSelect`, `toTrackDto`, `userAvatarUrl`). |
| Pages | `app/(player)/[username]`, `[trackSlug]`, `[trackSlug]/[secret]` (`s-` prefix), `sets/[slug]`, `sets/[slug]/[secret]`; legacy `app/track/[id]`, `app/u/[id]`, `app/profile` | Everything user-facing stays under `(player)` so playback survives navigation. Profile page has the old tab layout with Tracks/Popular/Albums/Playlists wired (Reposts is a placeholder). |
| Stats + repair | `server/modules/stats.ts`, `server/modules/recount.ts`, `pnpm db:recount` | `bumpTrackDailyStat` is called inside the transactions of plays/likes/comments (same-day undo only, per IN-6). |
| Seed | `prisma/seed.ts`, `prisma/seed/demo-media.ts`, `SEED_README.md` | `DATABASE_URL=<local> pnpm db:seed` (refuses Neon unless `--force`). Demo login `demo@example.test` / `DemoPassword123!`. Demo media is prepared once into `demo/` in R2 (manifest). |
| Tests | unit `src/**/*.test.ts` (55), integration `tests/integration` (98), e2e `tests/e2e` (33 + 1 opt-in real-R2) | e2e fixtures: `tests/e2e/fixtures.ts` (creator `e2e-creator`, public/likes/plays/private/scheduled tracks, an album, a private playlist). |

**Deliberately deferred from the PRD's M0 wording** (nothing is forgotten, each has an owner milestone):

- AU-4 verified-email requirement for upload/comment/repost (M1, together with the verification email flow). Today any signed-in user can comment and upload.
- Full-text + trigram search columns (M5).
- Upload-time quota enforcement UP-8 (M2).
- Follow/repost/block rate limits, notifications on likes/comments (M4/M7).
- Navbar/layout redesign GL-1..GL-5 (M1 for auth/profile entries, M3 for mobile tabs and player sheet).

**Next up: M1 Accounts & profiles** (PRD §6, §9; exit: journey J2)

1. Better Auth: wire `sendVerificationEmail` / `sendResetPassword` to `server/modules/email` (limit 3/hour/address via `RATE_LIMITS.emailPerHour`), email verification, password reset (`/forgot-password`, `/reset-password`, revoke other sessions), common-password check (AU-3), "sign out everywhere" + session list (AU-6), Google accounts verified automatically.
2. `/signin`, `/signup` pages and sign-in modal with pending-action retry (AU-2); forced `/onboarding` until `onboardedAt` (username availability check + `UsernameRedirect` on rename, display name, avatar via the AVATAR pipeline, >= 3 genres, 12 suggested creators to follow, PRD 6.2).
3. Settings: profile (avatar/banner crop UI, links, city/country, bio), account (email/password change, connected accounts, delete account with `recount*` + `StorageDeletion`), privacy basics (AU-7..AU-10, 9.2).
4. Profile page with all tabs as real sub-routes (`/[username]/popular-tracks|tracks|albums|sets|reposts|likes|followers|following`, infinite scroll, Spotlight read side), follow/unfollow with counters + daily stats + rate limits (FO-*), followers/following pages, "Who to follow" (FO-4).
5. Enforce the verified-email gate (AU-4) in `upload.*`, `comments.create` and later repost; add the "Verify your email" prompt with resend.
6. Tests: integration per rule (verified gate, onboarding redirect logic as a pure function, follow counters under concurrency like the likes tests), e2e journey J2 (read verification link from `EmailMessage`).

**Environment gotchas for agents (cloud sandbox)**

- The sandbox's shell env has `DATABASE_URL` pointing at the **production Neon** database (and `DATABASE_URL_POOLED`). dotenv does NOT override real env vars, so a bare `pnpm prisma migrate ...` targets Neon (unreachable on TCP 5432 from here, but never rely on that). **Always prefix DB commands with the local URLs**:
  `DATABASE_URL=postgresql://streamer:streamer@localhost:5432/streamapp DATABASE_URL_UNPOOLED=postgresql://streamer:streamer@localhost:5432/streamapp pnpm ...`
  Tests: `TEST_DATABASE_URL=postgresql://streamer:streamer@localhost:5432/streamapp_test`.
- Local Postgres 16: `service postgresql start`; if the role is missing: `su postgres -c "psql -c \"create role streamer login superuser password 'streamer'\" -c 'create database streamapp owner streamer' -c 'create database streamapp_test owner streamer'"`.
- R2 is reachable from the sandbox with the env credentials (bucket has demo audio under `uploads/…`, artwork pool under `random-artwork-images/`). **Never delete objects in the shared demo prefixes.**
- The production Neon database is NOT touched by `dev` work. M0 replaces the migration history with a fresh baseline; before `master` is ever deployed with it, the Neon schema must be reset (see "Open items for the owner" below).

**Recipes used in the cloud sandbox** (set the env inline; never rely on the ambient `DATABASE_URL`):

```bash
LOCAL=postgresql://streamer:streamer@localhost:5432
# fresh test DB + integration tests
DATABASE_URL=$LOCAL/streamapp_test DATABASE_URL_UNPOOLED=$LOCAL/streamapp_test pnpm prisma db execute --stdin <<< "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
DATABASE_URL=$LOCAL/streamapp_test DATABASE_URL_UNPOOLED=$LOCAL/streamapp_test pnpm db:migrate
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp TEST_DATABASE_URL=$LOCAL/streamapp_test pnpm test:integration
# e2e (wipes the test DB, builds, starts the app on :3100); chromium is preinstalled in the sandbox
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp TEST_DATABASE_URL=$LOCAL/streamapp_test \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome pnpm test:e2e --trace off
# the opt-in real-R2 journey additionally needs: E2E_R2=1 E2E_PORT=3000 E2E_BROWSER_PROXY="$HTTPS_PROXY"
# dev server + demo data
DATABASE_URL=$LOCAL/streamapp DATABASE_URL_UNPOOLED=$LOCAL/streamapp pnpm db:migrate && pnpm db:seed   # (with the same env)
```

**Open items for the owner**

- Before merging `dev` into `master`: reset the Neon database schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on the direct URL) and let `prisma migrate deploy` apply the new `0_init`, because the baseline replaces migrations `0_init`..`2_artwork_image_widths`. Vercel's `vercel-build` would otherwise fail on the history mismatch.
- Set on Vercel before deploying M0: `CRON_SECRET` (the daily cron endpoint refuses callers without it), and optionally `RESEND_API_KEY` + `EMAIL_FROM`, `ADMIN_EMAILS`. Note the variable names differ between Vercel (`DATABASE_URL` = pooled, `DATABASE_URL_UNPOOLED` = direct) and the cloud sandbox (`DATABASE_URL`, `DATABASE_URL_POOLED`): the app reads `DATABASE_URL` (pooled at runtime) and `prisma.config.ts` prefers `DATABASE_URL_UNPOOLED` for migrations.
- Old user uploads in R2 (`uploads/<oldUserId>/…`, `artworks/<oldUserId>/…`, `waveforms/…`) become orphaned once the DB is reset. The seed copies the demo audio it needs to `demo/…`; the rest can be erased by the owner at their discretion (not done automatically).

## Goal

A pro-level portfolio demo (SoundCloud-style creator platform) that is:

- deployed on **Vercel (Hobby)** with **Neon Postgres (free)** and **Cloudflare R2**;
- one Next.js backend, structured so it could become a real product later.

## Decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | Keep the repo and Prisma schema; consolidate in place, no rewrite | The normalized schema, ADR, R2 asset lifecycle and auth are the valuable parts |
| 2 | Remove `apps/express`; port its routes to Next Route Handlers | Separate `*.vercel.app` projects are different sites (Public Suffix List), so auth cookies break; Vercel functions cannot hold sockets |
| 3 | Do not proxy audio through any server. Public tracks: R2 public/custom domain. Private/unlisted: Route Handler authorizes, then redirects to a short-lived presigned R2 GET | Keeps audio bytes off Vercel's free bandwidth; R2 supports range requests; likely fixes the old "chunk pending at 2 min" proxy bug; gives private/unlisted authorization |
| 4 | Waveform peaks + duration computed in the browser at upload (Web Audio), stored as small JSON in R2. `media-worker` becomes optional (Docker/Actions) | FFmpeg/audiowaveform do not fit Vercel free (250MB function limit, daily-only cron) |
| 5 | Drop socket.io (use polling/SSE if realtime is ever needed) | Not supported on Vercel functions |
| 6 | Drop Turborepo when only one app remains; hoist the app to the repo root; keep pnpm | One app does not need a task runner or workspaces |
| 7 | Migrate architecture on current versions first, then upgrade deps as separate commits | Failures stay attributable |
| 8 | Domain logic in `server/modules/*` plain services, storage/queue behind small interfaces | Keeps the app extractable later |

## Roadmap / checklist

- [x] **Phase 0 - safety net**: typecheck, lint (0 errors), tests, build, CI workflow
- [x] **Phase 1 - consolidate**: Express routes ported to Next Route Handlers; `apps/express` deleted (socket.io was never used)
- [x] **Phase 2 - audio delivery**: presigned R2 redirect; private/unlisted authorization; `POST /api/tracks/:id/play`. Play dedupe done (see Track delivery)
- [x] **Phase 3 - waveform**: browser-side peaks + duration at upload; `media-worker` is now optional (backfill only; `pnpm dev:worker`)
- [x] **Phase 4 - de-monorepo**: app hoisted to repo root; Turborepo, `packages/*` and the optional `media-worker` deleted (fresh app: no backfill needed)
- [~] **Phase 5 - dependency upgrades** (done: in-range bumps, Better Auth 1.7, Next 16, Prisma 7, zod 4 + resolvers 7, zustand 5, lucide 1; skipped on purpose: TypeScript 7, ESLint 10, Prisma 8 RC) (one commit each, read current migration guides first): Next, React, Prisma (+ `generator` output path, deprecated in Prisma 7), Tailwind, Better Auth, zod, rest
- [~] **Phase 6 - Neon + Vercel** (done by user: Neon project, `0_init` migration, Vercel project on `master`; todo: verify deployed app end to end): pooled `DATABASE_URL` at runtime, direct URL for migrations; switch `db push` to `prisma migrate`; verify custom `stream` schema on Neon; deploy
- [x] **Phase 7 - quality**: 16 integration tests (claim race, rollback, ownership, visibility, auth), lint at 0 warnings (enforced), README. Remaining ideas: dedupe play events, rate limiting, E2E in CI, demo screenshots

## Commands

```bash
pnpm install
pnpm check-types   # tsc
pnpm lint          # eslint, fails on any warning
pnpm test          # unit tests, node:test, src/**/*.test.ts (no DB)
TEST_DATABASE_URL=postgresql://... pnpm test:integration   # 98 tests against a real Postgres (skips if unset)
TEST_DATABASE_URL=postgresql://... pnpm test:e2e           # Playwright, WIPES that database, builds + starts the app (33 tests, +1 opt-in real-R2 test)
DATABASE_URL=postgresql://... pnpm db:seed                 # demo world (see SEED_README.md)
DATABASE_URL=postgresql://... pnpm db:recount              # repair every denormalised counter
SKIP_ENV_VALIDATION=1 pnpm build   # no real env needed to build
```

CI (`.github/workflows/ci.yml`) runs type check, lint, unit, migrations + drift guard, integration and e2e on PRs and `master`.

## Environment

Real secrets are configured in the cloud environment (not in the repo). Names are listed
in `.env.example`; validation schema is `src/env.js`. A session started
before the variables were added will not see them.

## Track delivery (current design)

All under `src/app/api/tracks/[trackId]/`, logic in `src/server/modules/tracks/`:

| Route | Behaviour |
|-------|-----------|
| `GET stream` | visibility check -> `307` to presigned R2 GET (1 h). Range/seek handled by R2 |
| `GET waveform` | overview JSON streamed through the function (small, immutable, `public` cache only for PUBLIC tracks) |
| `GET artwork` | `307` to `publicUrl` or presigned URL (fallback when `R2_PUBLIC_BASE_URL` is unset) |
| `POST play` | `recordPlay()` in `server/modules/tracks/plays.ts`: one counted play per listener (account, else HMAC(ip+user-agent)) per track per 30 min, serialised with a Postgres advisory lock; always answers 204 for a viewable track. The player calls it after 5 s of real listening |

Visibility (since M0, superseding the text below): PUBLIC = anyone; PRIVATE = owner or anyone with the secret link (`?s=`, or `?c=<collectionId>&s=`); SCHEDULED = private until `publishAt`. Denied and missing both return 404. See `server/modules/visibility`.
The old JWT playback-token flow (`stream.getPlaybackToken`, `JWT_PLAYBACK_SECRET`) and the desktop auth-code exchange
(`/auth/exchange-code`, in-memory map, incompatible with serverless) were dropped. The legacy unauthenticated `/api/upload` was removed.

## Upload analysis (current design)

`FileStepForm` decodes the file with Web Audio (`lib/analyze-audio.ts`) while it uploads to R2, computing duration and
20 min/max pairs per second as signed 8-bit (`lib/waveform-compute.ts`). The result rides along on
`upload.markUploadComplete({ mediaAssetId, analysis? })`. The server (`server/modules/tracks/analysis.ts`) validates it
(ranges, peak count must match duration), writes audiowaveform-format JSON to `waveforms/{userId}/{audioAssetId}/v1/overview.json`,
creates an `ATTACHED` WAVEFORM asset and a `READY` `AudioAnalysis` in one transaction. If the browser cannot decode the file
the upload still succeeds with `AudioAnalysis.FAILED` (UI shows no waveform). Cancelling/expiring the audio also deletes its waveform.
No `MediaProcessingJob` is queued anymore. Trust model: peaks are client-supplied, so a creator could fake their own waveform; acceptable for a demo.
The unused 100 px/s detail waveform is no longer produced.
Rendering (`buildWaveformBars` in `lib/waveform-utils.ts`): bar count = display width / 3 px (2 px bar + 1 px gap), each bar is the RMS of the 50 ms peak amplitudes it covers, scaled so the 99th percentile bar is full height. The stored format did not change.

## Demo data

`pnpm db:seed` (see `SEED_README.md`) builds the whole demo world. The old `db:seed:r2` script was removed in M0.

## Log

> The Log below is history up to session 10 and describes the OLD data model (Release, Playlist, UNLISTED,
> `artist` router, MediaProcessingJob, etc.). The PRD implementation log is at the very end ("PRD implementation log").

### Session 1 - Phase 0
- Created branch `refactor/single-nextjs-app`.
- Baseline: web had 6 type errors and 67 lint errors; express/worker typechecked clean.
- Fixed type errors; `tsconfig` now excludes `eslint.config.js` and sets `checkJs: false`.
- `next build` found an extra error `tsc` missed (stale `[song]` page); `next build` is the stricter check, keep it in CI.
- ESLint: disabled `prefer-nullish-coalescing` (changes `||` empty-string semantics), relaxed `no-floating-promises` for `*.test.ts`, fixed the rest by hand. Result: 0 errors, 31 warnings.
- Deleted dead code: `api/audio` (hardcoded Windows path), `/stream` demo page, `WaveAudioPlayer`, `Wavesurf`, `test-player`, `[song]` placeholder, `json-info`, and the `wavesurfer` deps. Removed the `react-scan@latest` unpkg script from the production layout.
- Web scripts: `lint` is plain `eslint .` (`next lint` needs env validation and is deprecated); added `check-types` and `test`. Removed broken `lint` scripts from express/media-worker (no ESLint config; both are being removed/moved).
- Added root `test` task and the CI workflow.
- **Next up: Phase 1.**

### Session 2 - Phase 1 + 2
- Environment: cloud container can reach R2 but **not Neon over TCP 5432** (only HTTPS egress; Neon's HTTPS host answers). Used the container's local Postgres 16 (`postgresql://streamer:streamer@localhost:5432/streamapp`, `service postgresql start`) with `prisma db push`. For Neon from here, Phase 6 should use `@prisma/adapter-neon` (HTTP/WebSocket on 443); from a normal machine / Vercel plain TCP works.
- `apps/web/.env` created locally (gitignored) from the environment variables; `BETTER_AUTH_SECRET` is a throwaway local value. **Still needed on Vercel**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, plus the Google OAuth redirect URI.
- Ported stream/waveform/artwork/metadata to Route Handlers (see above), verified live against R2: 307 -> presigned URL -> `206` on range request; waveform 200; private -> 404; unlisted -> 307; play increments count.
- Removed: `apps/express`, `strream` tRPC router, legacy `store/playback.tsx` + `useKeyboardNavigation`, `jsonwebtoken`, `GOOGLE_GENERATIVE_AI_API_KEY`/`JWT_PLAYBACK_SECRET` from the env schema, `NEXT_PUBLIC_STREAM_API_URL`.
- URLs in the artist router are now same-origin (`/api/tracks/...`), via `trackUrls()`.
- Added `access.test.ts` (visibility rules). 12/12 tests, 0 lint errors, build OK.
- **Next up: Phase 3** (browser-side waveform at upload) then Phase 4 (hoist to root). The media-worker still works against the same DB/R2 for now.

### Session 2 (cont.) - Phase 3
- Browser-side analysis + server persistence as described in "Upload analysis". Verified in headless Chromium against real R2 (CORS on the bucket allows the presigned PUT from `localhost:3000`): 12 s tone -> `durationMs` 12000, 240 peaks, `AudioAnalysis.READY`, waveform served by `/api/tracks/:id/waveform`, cancel removes the waveform object + row, no worker job queued.
- `pnpm dev` now starts only the web app; `pnpm dev:worker` runs the media-worker for backfilling old tracks. The worker moves to `worker/` or gets deleted in Phase 4.
- Tests: 19 (new: peak computation, analysis schema, key layout).
- **Next up: Phase 4** (hoist `apps/web` to repo root, drop Turborepo/`packages/*`).

### Session 2 (cont.) - Phase 4
- Hoisted `apps/web/*` to the repo root with `git mv` (history preserved). Deleted `apps/media-worker` (Phase 3 made it redundant; this is a fresh app, nothing to backfill), `packages/*` (`@repo/ui` was unused; tsconfig base inlined; ESLint config was already local), `turbo.json`, `pnpm-workspace.yaml`, `TODO.md` and the stale `HANDOVER.md` (superseded by this file, `CONTEXT.md` and the ADR).
- `package.json`: name `music-stream-app`, `pnpm.onlyBuiltDependencies` allowlist (pnpm 10 skips build scripts otherwise), `test` is now a glob over `src/**/*.test.ts`, `dev:worker` removed. CI workflow unchanged and still valid.
- Verified: check-types, lint (0 errors), 19/19 tests, build.
- `.env` moved to the repo root (still gitignored). Remember to rebuild the Vercel project root to `/` (default).
- **Next up: Phase 5** (dependency upgrades, one commit each) or Phase 6 (Neon + Vercel) - recommend 6 first so there is a deployed baseline, then upgrade.

### Session 3 - Phase 6 prep
- Baseline migration `prisma/migrations/0_init` generated from the schema; verified on a fresh DB (`migrate deploy` then `migrate diff` = no difference). Local `streamapp` DB marked as applied. **Create Neon tables with `DATABASE_URL=<direct url> pnpm db:migrate`** (not `db:push`). From now on schema changes go through `pnpm db:migrate:dev`.
- Migrations use the direct URL; runtime on Vercel uses the pooled URL as `DATABASE_URL`. No `directUrl` in the datasource since Vercel never runs migrations.

### Session 3 (cont.) - Phase 5 + Neon merge
- Upgrades, one commit each, all verified with check-types/lint/test plus a runtime smoke test (pages, track routes, sign-up/in, headless-Chromium upload + analysis): in-range bumps; Better Auth 1.2 -> 1.7; Next 15 -> 16 (Turbopack default, native flat ESLint config, `import type` for `AppRouter`: with `verbatimModuleSyntax` an inline `{ type X }` import stays as a side-effect import and pulled server env into the client bundle under Turbopack); Prisma 6 -> 7.
- Removed dead three.js components + `three`/`@react-three/fiber`; `useTrackWaveform` no longer resets state inside an effect (new react-hooks rule).
- **Merged `master`** (user's Neon setup: `neon.ts`, `DATABASE_URL_UNPOOLED`, `@prisma/adapter-pg`, `0_init` migration identical to ours).
- **Prisma 7 layout**: generator `prisma-client` -> `src/generated/prisma` (gitignored, created by `postinstall`/`pnpm db:generate`); datasource URLs live in `prisma.config.ts` (CLI uses `DATABASE_URL_UNPOOLED ?? DATABASE_URL`, loads `.env` via dotenv); app + seeds build clients via `src/server/prisma-client.ts` (pg adapter, pooled URL). `migrate dev` no longer generates, so `pnpm db:migrate:dev` runs `prisma generate` after it.
- Correction: the pg adapter is enough for Neon on Vercel (pooled URL); a Neon-specific adapter would not help migrations from restricted networks, which use Prisma's schema engine over TCP.
- `@neon/env` is in package.json from the Neon setup but unused by the app code.

### Session 3 (cont.) - security / lockfile
- Vercel blocked the deploy of `master` ("Vulnerable version of Next.js"): master still has Next 15.3.1. This branch is on Next 16.4.6; merging it fixes that.
- `pnpm audit` showed 83 advisories even on this branch because `pnpm-lock.yaml` still carried phantom `apps/web` + `apps/media-worker` importers (pnpm kept them from `node_modules/.pnpm/lock.yaml` after the de-monorepo). Fix = delete `node_modules` and the lockfile, reinstall. Now 0 advisories; `effect` (Prisma CLI chain) is pinned via `pnpm.overrides` to `^3.22.1` (do NOT use `>=`, it jumps to an incompatible major and breaks `prisma generate`).
- Zustand 5 + zod 4 + lucide 1 verified at runtime (playback advances through the R2 redirect, form validation messages, createTrack).

### Session 3 (cont.) - Phase 7
- `artist.getTrack` now uses the same visibility rule as the stream route (`canAccessTrack`): unlisted tracks open via link, private tracks only for their creator (previously both 404ed on the detail page while the stream worked).
- Integration tests in `tests/integration/` (own `setup.ts` loaded via `node --import` so the app's db points at `TEST_DATABASE_URL`; refuses to run without it so dev/prod data is never touched; each test cleans up the users it created): concurrent publish of one asset (exactly one wins), cross-user asset rejected, pending asset rejected, rollback of the audio claim when artwork is not ready, release ordering + attach, release rollback with a foreign asset, duplicate file in one release, auth required, getTrack/listing visibility, Better Auth email sign-up/sign-in/duplicate. Not covered (needs R2 stub): cancel-vs-publish race.
- CI now has a Postgres 16 service, runs `pnpm db:migrate` then `pnpm test:integration`.
- Lint: 45 warnings -> 0 and `--max-warnings 0`. Decisions: shadcn `components/ui` exempt from `consistent-type-imports` (vendored); `@next/next/no-img-element` off because artwork is served from presigned R2 URLs that the Next image optimizer cannot cache usefully; removed dead `NowPlayingCard`.

### Session 4 - play counting
- `PlayEvent.clientHash` (+ index) via migration `1_play_event_client_hash` (hand-written, `migrate diff` shows no drift). **Run `pnpm db:migrate` against Neon (direct URL) before deploying code that includes it**, otherwise `/play` returns 500 (client ignores it, nothing else breaks).
- Plays are counted once per account or anonymous client per track per 30 min; the anonymous key is an HMAC (secret = `BETTER_AUTH_SECRET`) of ip + user agent, so no raw IP/UA is stored. Signed-in listeners are keyed by account only. The player reports a play after 5 s of playback (was: at load).
- Tests: unit (hash, ip parsing) + integration (repeat, distinct clients, account dedupe across devices, window expiry, 5 rounds x 40 concurrent requests, no raw ids stored). Mutation-checked: removing the advisory lock makes the concurrency test fail.
- Known limits: a bot rotating IPs and user agents can still inflate counts; real protection would need a rate limiter with shared state (Upstash/Vercel KV) or bot checks. Not worth it for a demo.

### Session 5 - CI + automatic dependency updates (ported from HyperGrapher/monarch-next-template)
- Adapted the template's workflows: shared composite actions `.github/actions/{setup,verify}`, `ci.yml`, `dependency-updates.yml` and `scripts/deps/*` (plan / apply / combine). Changes vs the template: default branch `master`; Node 22 and pnpm from `packageManager` (no workspace flag); Prisma instead of Payload (migrate on a throwaway DB + `prisma migrate diff --exit-code` drift guard; verified it fails with exit 2 on an unmigrated schema edit); lockstep groups `next`+`eslint-config-next`, `react`+`react-dom`, react types, tailwind pair, `prisma`+`@prisma/*`, `@trpc/*`; never auto-bump the major of `@types/node` (follows Node 22) and `typescript` (native-compiler major is adopted by hand).
- New Playwright suite (`tests/e2e`, 11 tests + 1 opt-in): `server.mjs` wipes the test DB, migrates, seeds fixed fixtures, builds and starts the app with dummy credentials; covers pages, visibility (public/unlisted/private incl. owner vs stranger), the stream redirect, play dedupe, auth. `upload-playback.e2e.spec.ts` (opt-in, real R2) runs the full creator journey and cleans its R2 objects. Safety: refuses to run if `TEST_DATABASE_URL` equals `DATABASE_URL(_UNPOOLED)`, and overrides both for the app it starts (prisma.config.ts prefers the unpooled URL).
- Better Auth's rate limiter (429 on repeated sign-ups) stays enabled in e2e; tests sign up once and share the session; the helper retries once after `x-retry-after`.
- Verified locally: whole verify sequence on a fresh DB (23 unit, 22 integration, 11 e2e); planner against the real registry (currently proposes eslint 10, a minor batch, lockfile refresh); apply/combine with simulated passing and failing candidates. NOT verified: the workflows on GitHub itself (cannot run Actions from here).
- Needs repo settings (GitHub -> Settings): Actions -> General -> "Allow GitHub Actions to create and approve pull requests" (for the PR fallback); optionally branch protection on `master` with the `test` check required. Pushes made by the dependency workflow use `GITHUB_TOKEN`, so CI does not re-run on them (the tree was just tested) but Vercel deploys them to production, where `vercel-build` applies pending migrations.

### Session 5 (cont.) - first production upload
- Upload on Vercel failed with a CORS error: the R2 bucket's CORS policy only allowed `localhost:3000`. Fix is bucket config, not code: allow `PUT` + `Content-Type` from `https://music-stream-app-2025.vercel.app` (Cloudflare dashboard -> R2 -> bucket -> Settings -> CORS policy). Add one origin per deployment domain you upload from.
- Also found while diagnosing: AWS SDK >= 3.729 defaults to `requestChecksumCalculation: "WHEN_SUPPORTED"`, which puts the CRC32 of an *empty* body into presigned PUT URLs (`x-amz-checksum-crc32=AAAAAA==`). R2 tolerated it but real S3 would reject every upload. `src/lib/r2.ts` now uses `WHEN_REQUIRED`; the real-R2 e2e test still passes.

### Session 6 - browsable site (home + discover)
- `discover` tRPC router (`tracks`: sort latest/popular, genre, search over title + creator name, limit <= 48; `genres`: public genres with counts) on top of `server/modules/tracks/discover.ts` (where/orderBy/select + the card DTO). Public tracks only; popular sorts by plays, likes, newest, id so ties are stable.
- UI: `TrackCard`/`TrackGrid` (artwork, creator link, plays, genre, hover play button; the grid becomes the player queue). `/` is now a real landing page (hero, Trending now when anything has plays, New releases, empty state) and was moved into the `(player)` route group, because outside it there was no player bar. `/discover` has sort tabs, genre chips and `?q=` search; filters live in the URL.
- Navbar: search box is a real GET form to `/discover?q=`; removed the dead Feed, Library, For Artists links and the non-functional Upgrade button; Discover stays visible on phones. Deleted the `/feed` stub.
- Tests: 7 integration (visibility, sorting incl. tie-breaks, genre, case-insensitive search that never matches private titles, limit bounds, DTO shape, genre counts) and 9 e2e (home, card navigation, no dead links, card play points the player at the stream URL, discover sorting/genre chips/search, navbar search). Learned: e2e must wait for hydration before clicking hover-revealed buttons.
- Visually checked desktop and phone screenshots against demo data.
- Not done: pagination beyond 48 results, search over tags/genre text, per-genre pages as separate routes (filters are query params).

### Session 6 (cont.) - README
- Rewrote `README.md` as a portfolio page: live demo + CI badge, screenshots (`docs/screenshots/*.jpg`, JPEG to keep the repo small; regenerate with a Playwright script against the demo data after UI changes), an honest "what works / not built yet" list, Mermaid architecture + upload + playback diagrams (rendered and validated), decisions table, stack, layout, local setup, env table, deploy checklist, tests/CI/dependency updates.
- `.env.example` rewritten: removed the media-worker variables, a personal Cloudflare dashboard URL and an email note, and the stale `directUrl` wording; `R2_PUBLIC_BASE_URL` is commented out (a placeholder URL would silently break artwork). The R2 account id remains in git history from older versions of that file; it is an identifier, not a credential.
- Keep the README claims in sync with reality when features land (likes, comments, playlists are listed as not built yet).

### Session 6 (cont.) - likes
- `engagement.setTrackLike({ trackId, liked })` (protected): idempotent like/unlike via `setTrackLike()` in `server/modules/tracks/likes.ts`. `likeCount` is incremented/decremented only by the number of rows `createMany(skipDuplicates)` / `deleteMany` really changed, in one transaction, so repeats and races cannot drift the counter. Visibility follows the stream rule (`canAccessTrack`; hidden tracks answer NOT_FOUND, anonymous callers UNAUTHORIZED). Tracks can be liked through an unlisted link.
- Read side: `likedByMe` on `artist.getTrack`, `getLatestTracks`, `getPopularTracks` and release tracks via `likedByMeSelect(viewerId)` (anonymous viewers match nothing), so pages render the right heart on first paint. Discover cards do not show likes.
- Client: `useTrackLike` (optimistic flip, server count replaces it, rollback + toast on error, "Sign in to like tracks" toast when signed out; state resyncs from props without an effect) and `LikeButton` (pill in lists, round in the track hero).
- Tests: 7 integration (idempotence, per-user counting, 20 parallel same-user requests, 12 concurrent distinct users, like/unlike storm, auth, private/unlisted rules, unknown ids, `likedByMe` per viewer across the queries) and 2 e2e (anonymous prompt; like/unlike with reload persistence, DB counter checked). Counter-equals-rows is asserted after every scenario.
- Known gap: deleting a user cascades their `TrackLike` rows but does not decrement `Track.likeCount` (no account-deletion feature exists yet; when it does, recount in the same transaction). Notifications for likes are not created yet.

### Session 7 - timed comments
- Uses the existing `Comment` model; no migration. `timestampSeconds Int?` = whole seconds into the track, null for a general comment. The client reads `usePlayerStore.getState().currentTime` **at the moment of posting** (not when typing starts), floors it, and only attaches it when this track is the one loaded in the player (a "Comment at m:ss" checkbox shows the live position and can be switched off). Finer than whole seconds would need a column change.
- Server (`server/modules/tracks/comments.ts`, router `comments`): `list` (newest 100 threads, replies oldest first, per-viewer `canDelete`; hidden tracks list nothing), `create`, `delete`. Rules: same visibility rule as streaming; content trimmed, 1-1000 chars; timestamp must be an integer within the track (0..ceil(duration), 4 h cap when duration is unknown) and is rejected on replies; replies are one level deep (a reply to a reply attaches to the root); at most 8 comments per author per minute (TOO_MANY_REQUESTS); authors and the track's creator may delete, anyone else gets FORBIDDEN; deleting a thread removes its replies and lowers `commentCount` by exactly the thread size (`GREATEST(0, ...)`).
- Consistency: create and delete take `pg_advisory_xact_lock(hashtextextended('comments:<trackId>'))` so `commentCount` always equals the rows. The random race (delete a thread while replies arrive) is too narrow to hit by brute force, so the test is deterministic: it holds the lock in the test and proves create and delete wait for it while other tracks do not. Mutation-checked: fails without the lock, passes with it.
- UI: `CommentsSection` (server prefetch + hydrated `useQuery`, so no loading flash; composer, threads, reply, delete with confirm), `CommentMarkers` (avatars under the hero waveform at `seconds / duration`), `usePlayAt` (load the track if needed, seek, play; a seek during loading is applied when the media is ready). Rendered as text (no HTML), `whitespace-pre-line`.
- Tests: 13 integration (exact second stored, whole-second/in-track validation, threading + root attachment, replies cannot be timed, visibility, rate limit, 24 concurrent posters, moderation, `canDelete` flags, thread deletion counts, lock contract) and 4 e2e (public view + waveform markers, general comment, **exact-second capture by seeking via an existing comment's chip then posting**, opt-out of the time, replies, deletion). The opt-in R2 test additionally plays real audio and asserts the stored second matches the player's position at the click.
- Known limits: no pagination beyond the newest 100 threads / 100 replies each; no edit; no comment likes (model exists); no notifications for new comments (model exists); deleting a user cascades their comments without adjusting `Track.commentCount` (same account-deletion caveat as likes).

### Session 8 - waveform rendering (branch `waveform`)
- Problem: long tracks rendered as a solid block. Each display bar took the **maximum** of the 50 ms windows it covered (about 14 per bar for a 3-4 min track at 2 px pitch); mastered music hits near full scale in almost every window, so every bar was full height. Short tracks (NiceFlex 1, 35 s, about 2 windows per bar) looked fine, which hid the bug.
- Fix (render-only, no data/format change, no backfill): `buildWaveformBars(peaks, barCount)` takes the RMS of the per-window peak amplitude over each bar's interval, normalises to the 99th-percentile bar (floor 0.04 so near-silence is not blown up) and interpolates when a track has fewer windows than bars. `WaveformVisualizer` draws 2 px bars every 3 px snapped to device pixels, so the bar count depends on the width only (about 260 for a 780 px waveform, close to SoundCloud).
- Chosen by rendering the real demo waveforms (max vs mean vs RMS, gamma 1 and 1.5) against SoundCloud screenshots of the same tracks: RMS with linear scaling matched the intros, breaks and ripple best; gamma 1.5 exaggerated drops. No library does this (wavesurfer.js / peaks.js also draw max peaks).
- Write-up with settings and how to tune or revert: [`docs/waveform-fix.docx`](waveform-fix.docx).
- Tests: 5 new unit tests (bar count independent of length, quiet passages survive transients, polarity, interpolation, silence). Verified check-types, lint, 27 unit, 26 e2e, and screenshots of the track page with the real waveforms.

### Session 9 - demo artwork
- The demo creator's old artwork files were deleted from R2 and replaced by a pool of 27 images at `random-artwork-images/artwork-001..027.webp` (bucket `music-stream-app`).
- Production data fix (one transaction, over Neon's HTTPS endpoint because port 5432 is blocked from the cloud sandbox): each of the 8 demo tracks got its own randomly chosen image as a new `IMAGE` asset (`ATTACHED`, `image/webp`), and the 2 old asset rows pointing at the deleted files were removed. Verified: every `/api/tracks/:id/artwork` on the live site redirects to a 200 `image/webp`, and `/discover` has no broken images.
- `prisma/seed-r2.ts` now takes artwork from that pool, shuffled so each new track gets a different image (checked on a throwaway local database: 10 tracks, 10 distinct images).

### Session 10 - artwork processing (sharp + srcset)
- Upload path unchanged for the browser (presigned PUT of the original). `markArtworkUploadComplete` now verifies the object, then `processArtworkObject` (sharp: auto-orient, centre-crop square, WebP q80, metadata stripped, inputs over 50 MP refused) writes `artworks/<userId>/<assetId>/{96,320,640}.webp`, points the asset at the largest rendition (`storageKey`, new `imageWidths Int[]`, migration `2_artwork_image_widths`) and deletes the original. Never upscales: a 462 px-short image gives 96/320/462. Keys derive from the asset id, so a duplicated call overwrites instead of leaking.
- Why 640: the largest artwork box is the track page hero (320 px from md up, full width below 768 px), so 640 covers desktop at 2x; on a portrait tablet a 640 image fills a ~720 px box, which is barely visible. Originals are deleted to keep R2 small (decision by the owner); larger sizes cannot be regenerated.
- Delivery: one `trackArtwork()` mapping (replacing 5 copies) returns `artworkUrl` (largest) + `artworkSrcSet`; `/api/tracks/:id/artwork?w=` redirects to a rendition. Presigned artwork URLs are signed at the start of an hour (`presignGetStable`) so they stay identical and the browser cache, plus the renditions' `immutable` Cache-Control, actually works. Every artwork `<img>` has `sizes` matching its CSS box (`ARTWORK_SIZES`). Legacy single-file images keep working without a srcset. The OS media-session artwork no longer claims to be a 512 px JPEG.
- Deleting an image asset (expired/cancelled uploads) removes all renditions.
- `pnpm artwork:backfill [--dry-run]` converts existing images; it deletes a source only when it is the owner's own upload (`artworks/<ownerId>/`), never the shared demo pool. `seed-r2` now makes renditions from the pool the same way.
- Tests: 7 unit tests (width planning, keys, srcset, real sharp renders incl. an EXIF-orientation test mutation-checked to fail without auto-orient, corrupt/oversized inputs), 1 integration test (srcset DTO for processed vs legacy artwork on discover and the track page), the opt-in real-R2 e2e now uploads a 1500x1000 JPEG through the form and asserts exactly the 3 renditions exist in R2 (original gone), each `?w=` serves an image of that size, and the browser picks the 320 rendition for the 320 px hero. Backfill exercised against real R2 with a local DB (own upload processed + deleted, pool source kept, second run a no-op). Verified: types, lint, 34 unit, 50 integration, 27 e2e.
- Production backfill is pending: it needs the migration, which Vercel applies on the production deploy after merge.

## PRD implementation log

### Session 11 - PRD M0 (foundation reset), branch `dev`
- Replaced the schema with PRD §16 and a fresh `0_init` baseline (old migrations deleted): Collection replaces Release/Playlist, Visibility = PUBLIC/PRIVATE/SCHEDULED + moderation, usernames, slugs + redirect tables, notifications/messages/reports/stats/rate-limit/storage-deletion tables, `Track.audioAssetId` no longer unique (demo audio is shared). Dropped `MediaProcessingJob`/`MediaProcessingError`, the detail waveform and `AudioAnalysis.QUEUED/PROCESSING`.
- New server modules: clock, names/slugs, visibility, entitlements, rate limiter, email, storage deletion queue, housekeeping + `/api/cron/daily`, image pipeline for avatars/banners, publishing, stats/recount (see the table at the top for locations).
- Auth: Better Auth `databaseHooks` generate a unique lowercase username at user creation (reserved words skipped, `_2` suffixes, recently renamed handles held for 30 days) and grant ADMIN to `ADMIN_EMAILS` at sign-up/sign-in; `username`/`role` are `input: false` (clients cannot set them).
- Behaviour changes versus before: you cannot like your own track (A3); private tracks cannot be liked even through a secret link; `markUploadComplete` requires the browser analysis (files the browser cannot decode are rejected); max audio size is 100 MB (entitlements); comment limits moved to the bucket limiter (8/min + 200/day); tRPC timing logs only in development.
- Ported UI/routes to permalinks (see "Pages" in the table), added the collection page, legacy redirects, `s-` secret routes, `noindex` for hidden content, canonical links. Removed `artist` router, `/track/[id]` page (now a redirect), `scripts/process-artwork.ts` and `artwork-backfill` (nothing to backfill on a fresh DB), `db:seed:r2`.
- Seed rewritten (`pnpm db:seed`), verified by running it twice against a local database and browsing the pages (screenshots checked: track page, album page).
- Verified locally on a fresh database: `check-types`, `lint` (0 warnings), 53 unit tests, 98 integration tests, 33 e2e tests, the opt-in real-R2 upload e2e (upload -> in-browser analysis -> publish -> play -> comment), `next build`, and `prisma migrate diff` shows no drift. NOT verified: the GitHub workflows themselves, the Vercel deployment, anything against Neon (the sandbox cannot reach it and was deliberately kept away from it).
- Learned: Better Auth rejects client-supplied `input: false` fields at sign-up and silently drops unknown ones; `tx`-scoped rate-limit upserts roll back with a rejected action, so only committed toggles count towards LK-3; running 20 parallel transactions that each need a second pooled connection can deadlock the pool, so keep helper writes inside the same `tx`.
