# Database Seed Script

This script populates the database with fake data for the SoundCloud-like music player application, including artists (users), tracks, albums, playlists, follows, likes, and comments.

## What the Seed Script Creates

- 10 artists (users) with names like "Muse", "Radiohead", etc.
- 1-3 albums per artist
- 5-15 tracks per artist
- 1-3 playlists per artist with 5-20 tracks each
- Follows between artists
- Likes on tracks
- Comments on tracks

## Prerequisites

Before running the seed script, ensure you have installed the required dependencies:

```bash
pnpm install
```

## Running the Seed Script

1. Make sure your database connection is properly configured in your `.env` file with `DATABASE_URL`.

2. Run the seed script using:

```bash
pnpm db:seed
```

## Warning

This script will delete all existing data in the tables it populates! Be careful when running it on a production database.

## Accessing the Seeded Data

Once the script has run, you can:

1. Visit artist profiles at routes like `/muse` or `/radiohead` (lowercase, URL-friendly versions of the artist names)
2. Visit individual tracks at routes like `/muse/song-name` (where song-name is the slugified version of the track title)
3. View the data directly using Prisma Studio:

```bash
pnpm db:studio
```

## Customizing the Seed

If you want to modify the seed data:

1. Open `prisma/seed.ts`
2. Adjust the arrays of artist names, genres, etc.
3. Modify the number of items created by changing the parameters passed to `faker.number.int()`
4. Run the seed script again 