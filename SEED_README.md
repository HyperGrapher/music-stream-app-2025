# Demo data (`pnpm db:seed`)

Builds a believable demo world for local development (PRD section 20). It is **deterministic** (fixed random seed) and
**re-runnable**: each run first deletes the accounts the previous run created (every `@example.test` user, with all their
content, which cascades) and then rebuilds everything.

```bash
DATABASE_URL=postgresql://... pnpm db:seed
```

It refuses to run against what looks like production (Neon hosts, `NODE_ENV` / `VERCEL_ENV` = production) unless you pass
`--force`. **Check `DATABASE_URL` before running it**: in cloud sessions the shell may point at the production database.

## What it creates

- 1 admin, the demo login, 12 creators (2 of them Pro, 2 verified) and 40 listeners, with avatars, banners, bios, cities;
- about 80 public tracks, 3 private tracks (with secret links), 1 scheduled track (a Pro creator, publishes in 2 days);
- 6 albums / EPs / singles / a compilation and 8 playlists (one private) mixing creators, plus Spotlight items;
- a power-law follow graph, likes, reposts, timed comments with replies and comment likes, about 9000 play events over the
  last 120 days (sources and countries), and the daily statistics derived from them (`pnpm db:recount` logic);
- notifications for the demo login.

## Logins

| Account | Email | Password |
|---|---|---|
| Demo (creator + listener, has notifications) | `demo@example.test` | `DemoPassword123!` |
| Admin | `admin@example.test` | `DemoPassword123!` |

Every seeded account uses the same password. All emails and names are fake.

## Media

Tracks play the demo audio and show the artwork pool that already live in the R2 bucket. On the first run the seed builds
`demo/manifest.json` in R2: it copies the audio found under `uploads/` to `demo/audio/`, analyses it with `ffmpeg`
(duration and waveform), and turns `random-artwork-images/` into renditions under `demo/{artwork,avatars,banners}/`. Later
runs only read the manifest, so they need no `ffmpeg`. Several tracks share one audio file. Everything under `demo/` is
protected from the deletion queue.

The seed prints the secret links of the private tracks and the scheduled track at the end.
