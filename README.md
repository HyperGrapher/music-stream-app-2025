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

Required env (validated in `src/env.js`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
(optional `R2_PUBLIC_BASE_URL`). The R2 bucket needs a CORS rule allowing `PUT` from your app origin.

## Scripts

| Command | |
|---------|--|
| `pnpm check-types` / `pnpm lint` / `pnpm test` | typecheck, ESLint, node:test |
| `SKIP_ENV_VALIDATION=1 pnpm build` | production build without real env |
| `pnpm db:migrate` | apply committed migrations (use the **direct** Neon URL, not the pooler) |
| `pnpm db:migrate:dev` | create a new migration after editing `prisma/schema.prisma` |
| `pnpm db:studio` | Prisma Studio |
