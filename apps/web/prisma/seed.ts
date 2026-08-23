import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const creators = [
  ["burak", "burak@example.com", "Electronic sketches and late-night edits."],
  [
    "lena",
    "lena@example.com",
    "Dream pop, field recordings, and soft distortion.",
  ],
  ["miles", "miles@example.com", "Independent producer and live performer."],
] as const;

async function main() {
  await prisma.mediaProcessingError.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.playEvent.deleteMany();
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.trackLike.deleteMany();
  await prisma.releaseLike.deleteMany();
  await prisma.playlistLike.deleteMany();
  await prisma.trackRepost.deleteMany();
  await prisma.releaseRepost.deleteMany();
  await prisma.playlistRepost.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.playlistTrack.deleteMany();
  await prisma.releaseTrack.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.release.deleteMany();
  await prisma.track.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const users = [];
  for (const [name, email, bio] of creators) {
    users.push(
      await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name,
          email,
          emailVerified: true,
          bio,
        },
      }),
    );
  }

  await prisma.follow.createMany({
    data: [
      { followerId: users[0]!.id, followingId: users[1]!.id },
      { followerId: users[0]!.id, followingId: users[2]!.id },
      { followerId: users[1]!.id, followingId: users[0]!.id },
    ],
  });

  console.log(
    `Seeded ${users.length} creator profiles. Upload real media through the app.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
