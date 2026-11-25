import "dotenv/config";

import { createPrismaClient } from "../../src/server/prisma-client";
import { ALBUM, CREATOR, CREATOR_ID, PRIVATE_SECRET, PRIVATE_SET, TRACKS } from "./fixtures";

const db = createPrismaClient(process.env.DATABASE_URL!);
const DAY = 86_400_000;

async function audioAsset(key: string) {
  const audio = await db.mediaAsset.create({
    data: {
      ownerId: CREATOR_ID,
      kind: "AUDIO",
      status: "ATTACHED",
      bucket: "e2e-bucket",
      storageKey: `uploads/${CREATOR_ID}/${key}-seed.mp3`,
      originalFilename: "seed.mp3",
      mimeType: "audio/mpeg",
    },
  });
  // No waveform object exists in the fake bucket: FAILED means the UI does not poll for one.
  await db.audioAnalysis.create({ data: { audioAssetId: audio.id, status: "FAILED", durationMs: 30_000 } });
  return audio.id;
}

async function main() {
  await db.user.create({
    data: {
      id: CREATOR_ID,
      name: CREATOR.name,
      username: CREATOR.username,
      email: "e2e-creator@example.test",
      emailVerified: true,
      bio: "Seeded for end-to-end tests.",
    },
  });

  const publishedAt = new Date(Date.now() - 3 * DAY);
  const row = async (spec: { id: string; slug: string; title: string; genre?: string; playCount?: number; visibility?: "PUBLIC" | "PRIVATE" | "SCHEDULED" }, secret?: string) => {
    const scheduled = spec.visibility === "SCHEDULED";
    const publishAt = scheduled ? new Date(Date.now() + 2 * DAY) : undefined;
    await db.track.create({
      data: {
        id: spec.id,
        creatorId: CREATOR_ID,
        slug: spec.slug,
        audioAssetId: await audioAsset(spec.id),
        title: spec.title,
        genre: spec.genre,
        playCount: spec.playCount ?? 0,
        visibility: spec.visibility ?? "PUBLIC",
        publishAt,
        publishedAt: spec.visibility === "PRIVATE" ? null : (publishAt ?? publishedAt),
        secretToken: secret ?? `e2e-secret-${spec.slug}`.padEnd(22, "0").slice(0, 22),
        durationMs: 30_000,
        mimeType: "audio/mpeg",
      },
    });
  };

  for (const track of Object.values(TRACKS)) await row(track, track.id === TRACKS.private.id ? PRIVATE_SECRET : undefined);
  for (const track of ALBUM.tracks) await row({ ...track, genre: "classical" });

  const album = await db.collection.create({
    data: {
      id: ALBUM.id,
      ownerId: CREATOR_ID,
      slug: ALBUM.slug,
      type: "ALBUM",
      title: ALBUM.title,
      visibility: "PUBLIC",
      secretToken: "e2e-album-secret-00001",
      publishedAt,
      releaseDate: publishedAt,
      trackCount: ALBUM.tracks.length,
      durationMs: 60_000,
    },
  });
  for (const [position, track] of ALBUM.tracks.entries()) {
    await db.collectionTrack.create({ data: { collectionId: album.id, trackId: track.id, position, addedById: CREATOR_ID } });
  }
  // A private playlist mixing a public track and the private one (VI-3).
  const priv = await db.collection.create({
    data: {
      id: PRIVATE_SET.id,
      ownerId: CREATOR_ID,
      slug: PRIVATE_SET.slug,
      type: "PLAYLIST",
      title: PRIVATE_SET.title,
      visibility: "PRIVATE",
      secretToken: PRIVATE_SET.secret,
      publishedAt: null,
      trackCount: 2,
      durationMs: 60_000,
    },
  });
  for (const [position, id] of [TRACKS.public.id, TRACKS.private.id].entries()) {
    await db.collectionTrack.create({ data: { collectionId: priv.id, trackId: id, position, addedById: CREATOR_ID } });
  }
  await db.user.update({ where: { id: CREATOR_ID }, data: { publicTrackCount: 5 } });
  console.log("e2e seed done");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
