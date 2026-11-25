# Music Stream

A SoundCloud-style creator platform: upload tracks and releases, waveform playback, profiles, likes and comments.
Single Next.js app on Vercel + Neon Postgres + Cloudflare R2.

**Stack:** Next.js 15 (App Router), tRPC, Prisma, Better Auth (Google + email/password), Tailwind 4 / shadcn, Zustand.

## How it fits together

- **Uploads** go straight from the browser to R2 via presigned PUT. The browser also decodes the audio (Web Audio) to compute duration and waveform peaks, which the server validates and stores as JSON in R2.
- **Playback** never proxies audio: `/api/tracks/:id/stream` checks visibility and redirects to a short-lived presigned R2 URL (range requests handled by R2).
- **Domain model** is in `CONTEXT.md` and `docs/adr/`. Progress and decisions are tracked in `docs/REFACTOR.md`.

## Local development

```bash
pnpm install
cp .env.example .env        # fill in values (see below)
pnpm db:migrate             # apply migrations (prisma migrate deploy)
pnpm db:seed:r2             # optional: demo tracks from the R2 bucket (needs ffprobe)
pnpm dev                    # http://localhost:3000
```

Required env (validated in `src/env.js`): `DATABASE_URL` (pooled on Neon; `DATABASE_URL_UNPOOLED` = direct URL used by `prisma migrate`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
(optional `R2_PUBLIC_BASE_URL`). The R2 bucket needs a CORS rule allowing `PUT` from your app origin.

## Scripts

| Command | |
|---------|--|
| `pnpm check-types` / `pnpm lint` / `pnpm test` | typecheck, ESLint (no warnings allowed), unit tests |
| `pnpm test:integration` | DB-backed tests; needs `TEST_DATABASE_URL` pointing at a migrated, disposable Postgres |
| `pnpm test:e2e` | Playwright against a production build on a **wiped** `TEST_DATABASE_URL` database (`pnpm exec playwright install chromium` once) |
| `SKIP_ENV_VALIDATION=1 pnpm build` | production build without real env |
| `pnpm db:migrate` | apply committed migrations (use the **direct** Neon URL, not the pooler) |
| `pnpm db:migrate:dev` | create a new migration after editing `prisma/schema.prisma` (also regenerates the client) |
| `pnpm db:generate` | regenerate the Prisma client into `src/generated/prisma` (runs on `postinstall`) |
| `pnpm db:studio` | Prisma Studio |

## CI and automatic dependency updates

- `.github/workflows/ci.yml` runs on every PR and push to `master`: type check, lint (no warnings), unit tests, migrations + schema-drift guard, integration tests, and Playwright e2e on a production build, all on a throwaway Postgres service. No secrets needed.
- `.github/workflows/dependency-updates.yml` runs daily (and on demand): it checks npm, splits the available updates into candidates (minor/patch per lockstep group, one per major, lockfile refresh), tests **each candidate separately** with the same checks as CI, then commits the combination that passed straight to `master` (or opens an auto-merge PR if `master` is protected). Majors that break the tests are reported in an issue and not retried until a newer version appears. Settings: `scripts/deps/config.json`.
- Both share `.github/actions/{setup,verify}`.
- The opt-in test `tests/e2e/upload-playback.e2e.spec.ts` covers the real R2 journey (upload, in-browser analysis, publish, play). Run it locally with `E2E_R2=1 E2E_PORT=3000 pnpm test:e2e` (needs R2 credentials and bucket CORS for that origin).
