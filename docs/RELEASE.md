# Release checklist (Vercel + Neon + Cloudflare R2)

Run this before merging `dev` into `master` and after the first production deploy. Everything here was verified at the end of M8; items that need the owner's accounts are marked **owner**.

## Environment variables (Vercel, Production)

| Variable | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | the app (runtime) | Neon **pooled** URL |
| `DATABASE_URL_UNPOOLED` | `prisma migrate deploy` at build | Neon **direct** URL (no `-pooler` in the host). If missing, `prisma.config.ts` derives it from the pooled one |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | sessions | `BETTER_AUTH_URL` = the production origin |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in | Add `https://<domain>/api/auth/callback/google` as an authorised redirect URI |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | uploads and streaming | Bucket needs a CORS rule allowing `PUT`/`GET`/`HEAD` from the production origin (browser uploads go straight to R2) |
| `CRON_SECRET` | `/api/cron/daily` | Vercel sends it as `Authorization: Bearer`; without it the endpoint refuses everyone |
| `ADMIN_EMAILS` | `/admin` | Comma-separated. The account's email must be **verified** (Google accounts are). Applies on the next page load, no new sign-in needed |
| `RESEND_API_KEY`, `EMAIL_FROM` | real email | Optional: until set, every email is stored as `LOGGED` (see `email_message`). Verified-sender domain needed for `EMAIL_FROM` |
| `NEXT_PUBLIC_APP_URL` | absolute links in emails, sitemap, canonical URLs | Production origin |

## Database

1. `pnpm prisma migrate deploy` runs in `vercel-build` for production deploys. The `1_search` migration needs the `pg_trgm` extension (Neon allows it).
2. After adding any migration: apply it to a scratch database and run `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. CI runs the same drift guard.
3. Optional demo data: `DATABASE_URL=... pnpm db:seed` (see `SEED_README.md`). Repair counters any time with `pnpm db:recount`.

## Before merging

- [ ] CI green: types, lint, unit, drift guard, integration, e2e (includes axe accessibility and the layout-shift guard)
- [ ] Lighthouse (mobile, production build) of a track page: Performance >= 85, Accessibility >= 95, Best Practices >= 95, SEO >= 95. Last measured: 85-89 / 100 / 100 / 100 (`docs/REFACTOR.md`, Session 19, for the recipe)
- [ ] Manual smoke test on the preview URL: sign up, verify the email link (from `email_message` if Resend is not set), upload a real MP3, publish, play, comment, like, report, open `/admin` as an admin

## After the first production deploy

- [ ] `/robots.txt` and `/sitemap.xml` answer and list only public content
- [ ] Vercel cron `/api/cron/daily` shows a 200 in the function logs (storage drain, digests, pruning)
- [ ] Sign in with Google works on the production domain; the admin account sees "Admin" in the account menu
- [ ] Upload from the browser works (R2 CORS), a played track registers a play after ~5 s
