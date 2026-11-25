# Refactor: single Next.js app for Vercel + Neon

Living document. **Read this first in a new session**, then `HANDOVER.md`, `CONTEXT.md`
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
| 6 | Drop Turborepo when only one app remains; hoist `apps/web` to repo root; keep pnpm | One app does not need a task runner or workspaces |
| 7 | Migrate architecture on current versions first, then upgrade deps as separate commits | Failures stay attributable |
| 8 | Domain logic in `server/modules/*` plain services, storage/queue behind small interfaces | Keeps the app extractable later |

## Roadmap / checklist

- [x] **Phase 0 - safety net**: typecheck, lint (0 errors), tests, build, CI workflow
- [x] **Phase 1 - consolidate**: Express routes ported to Next Route Handlers; `apps/express` deleted (socket.io was never used)
- [x] **Phase 2 - audio delivery**: presigned R2 redirect; private/unlisted authorization; `POST /api/tracks/:id/play`. Follow-up: dedupe/rate-limit play events (one per listener per track per window)
- [ ] **Phase 3 - waveform**: browser-side peaks + duration at upload; make `media-worker` optional
- [ ] **Phase 4 - de-monorepo**: hoist `apps/web` to root, remove Turborepo/`packages/*`; move worker to `worker/` if kept
- [ ] **Phase 5 - dependency upgrades** (one commit each, read current migration guides first): Next, React, Prisma (+ `generator` output path, deprecated in Prisma 7), Tailwind, Better Auth, zod, rest
- [ ] **Phase 6 - Neon + Vercel**: pooled `DATABASE_URL` at runtime, direct URL for migrations; switch `db push` to `prisma migrate`; verify custom `stream` schema on Neon; deploy
- [ ] **Phase 7 - quality**: integration tests (asset claim races, release rollback, stream visibility, auth linking); clear remaining lint warnings (`no-unused-vars`, `<img>` -> `next/image`); README for the demo

## Commands

```bash
pnpm install
pnpm check-types   # tsc on all workspaces
pnpm lint          # eslint (web) - 0 errors, warnings tracked in Phase 7
pnpm test          # node:test suites (12 tests)
SKIP_ENV_VALIDATION=1 pnpm build   # no real env needed to build
```

CI (`.github/workflows/ci.yml`) runs the same four steps on PRs and `master`.

## Environment

Real secrets are configured in the cloud environment (not in the repo). Names are listed
in `apps/web/.env.example`; validation schema is `apps/web/src/env.js`. A session started
before the variables were added will not see them.

## Track delivery (current design)

All under `apps/web/src/app/api/tracks/[trackId]/`, logic in `src/server/modules/tracks/`:

| Route | Behaviour |
|-------|-----------|
| `GET stream` | visibility check -> `307` to presigned R2 GET (1 h). Range/seek handled by R2 |
| `GET waveform` | overview JSON streamed through the function (small, immutable, `public` cache only for PUBLIC tracks) |
| `GET artwork` | `307` to `publicUrl` or presigned URL (fallback when `R2_PUBLIC_BASE_URL` is unset) |
| `POST play` | increments `playCount` + inserts `PlayEvent` (listener from session if any); called once per playback start by the player store |

Visibility: PUBLIC/UNLISTED = anyone with the link; PRIVATE = creator only. Denied and missing both return 404.
The old JWT playback-token flow (`stream.getPlaybackToken`, `JWT_PLAYBACK_SECRET`) and the desktop auth-code exchange
(`/auth/exchange-code`, in-memory map, incompatible with serverless) were dropped. The legacy unauthenticated `/api/upload` was removed.

## Demo data

`pnpm --filter web db:seed:r2` registers the audio, artwork and waveforms already in the R2 bucket as one "Demo Creator"
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
