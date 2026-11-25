# Refactor: single Next.js app for Vercel + Neon

Living document. **Read this first in a new session**, then `CONTEXT.md`
and `docs/adr/`. Update the checklist and the log at the end of every work session.

Working branch: `refactor/single-nextjs-app` (do not use the auto-generated `claude/*` branches).

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
pnpm test          # unit tests, node:test, src/**/*.test.ts (23 tests, no DB)
TEST_DATABASE_URL=postgresql://... pnpm test:integration   # 29 tests against a real Postgres (skips if unset)
TEST_DATABASE_URL=postgresql://... pnpm test:e2e           # Playwright, WIPES that database, builds + starts the app (20 tests, +1 opt-in R2 test)
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

Visibility: PUBLIC/UNLISTED = anyone with the link; PRIVATE = creator only. Denied and missing both return 404.
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

## Demo data

`pnpm db:seed:r2` registers the audio, artwork and waveforms already in the R2 bucket as one "Demo Creator"
with 8 public tracks (idempotent; pairs waveforms to audio by ffprobe duration). Needs `ffprobe` and the `R2_*` + `DATABASE_URL` env.

## Log

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
