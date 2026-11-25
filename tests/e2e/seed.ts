import "dotenv/config";

import { createPrismaClient } from "../../src/server/prisma-client";
import { CREATOR_ID, TRACKS } from "./fixtures";

const db = createPrismaClient(process.env.DATABASE_URL!);

const visibilityOf = {
  public: "PUBLIC",
  unlisted: "UNLISTED",
  private: "PRIVATE",
  plays: "PUBLIC",
} as const;

async function main() {
  await db.user.create({
    data: {
      id: CREATOR_ID,
      name: "E2E Creator",
      email: "e2e-creator@example.test",
      emailVerified: true,
      bio: "Seeded for end-to-end tests.",
    },
  });

  for (const [key, track] of Object.entries(TRACKS) as [keyof typeof TRACKS, (typeof TRACKS)[keyof typeof TRACKS]][]) {
    const audio = await db.mediaAsset.create({
      data: {
        ownerId: CREATOR_ID,
        kind: "AUDIO",
        status: "ATTACHED",
        bucket: "e2e-bucket",
        storageKey: `uploads/${CREATOR_ID}/${track.id}-seed.mp3`,
        originalFilename: "seed.mp3",
        mimeType: "audio/mpeg",
      },
    });
    // FAILED = "no waveform available": the UI does not poll for it.
    await db.audioAnalysis.create({
      data: { audioAssetId: audio.id, status: "FAILED", durationMs: 30_000 },
    });
    await db.track.create({
      data: {
        id: track.id,
        creatorId: CREATOR_ID,
        audioAssetId: audio.id,
        title: track.title,
        visibility: visibilityOf[key],
      },
    });
  }
  console.log("e2e seed done");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
