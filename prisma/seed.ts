/**
 * `pnpm db:seed`: builds a believable demo world (PRD section 20). Safe to re-run: it first removes
 * the accounts a previous run created (every `@example.test` user, with all their content) and then
 * rebuilds everything from a fixed random seed, so the result is the same every time.
 *
 * Refuses to run against what looks like a production database (Neon hosts, NODE_ENV or
 * VERCEL_ENV = production) unless `--force` is given.
 *
 * Media: tracks play the demo audio and show the artwork pool that already live in R2 (prepared
 * once into `demo/` by prisma/seed/demo-media.ts). Several tracks share one audio file.
 *
 *   DATABASE_URL=postgresql://... pnpm db:seed
 */
import "dotenv/config";

import { S3Client } from "@aws-sdk/client-s3";
import { faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";

import type { Prisma } from "../src/generated/prisma/client";
import { GENRES } from "../src/lib/genres";
import { firstFree, normalizeTags, slugBase, usernameBase } from "../src/lib/names";
import { buildPublicObjectUrl } from "../src/server/api/routers/upload-lifecycle";
import { recountAll } from "../src/server/modules/recount";
import { newSecretToken } from "../src/server/modules/tokens";
import { createPrismaClient } from "../src/server/prisma-client";
import { loadDemoManifest, type DemoImage } from "./seed/demo-media";

const DAY = 86_400_000;
export const DEMO_EMAIL = "demo@example.test";
export const DEMO_PASSWORD = "DemoPassword123!";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const looksLikeProduction =
  /neon\.tech|vercel-storage|supabase\.co/.test(databaseUrl) ||
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production";
if (looksLikeProduction && !process.argv.includes("--force")) {
  throw new Error(
    "Refusing to seed what looks like a production database. Point DATABASE_URL at a local database, or pass --force.",
  );
}

const bucket = process.env.R2_BUCKET_NAME!;
const publicBase = process.env.R2_PUBLIC_BASE_URL;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const db = createPrismaClient(databaseUrl);

faker.seed(20_261_125);
const NOW = new Date();
const uuid = () => faker.string.uuid();
const pick = <T,>(items: readonly T[]) => faker.helpers.arrayElement(items);
const between = (min: number, max: number) => faker.number.int({ min, max });
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
/** Invented titles (faker's song list contains real songs). */
const songTitle = () =>
  `${faker.word.adjective()} ${faker.word.noun()}${faker.number.int(3) === 0 ? ` ${faker.word.noun()}` : ""}`
    .replace(/\b\w/g, (c) => c.toUpperCase());
const chunk = <T,>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Weights for a Zipf-like popularity curve over `n` items in shuffled order. */
function popularity(n: number, exponent = 0.9) {
  const order = faker.helpers.shuffle(Array.from({ length: n }, (_, i) => i));
  return order.map((rank) => 1 / (rank + 1) ** exponent);
}
function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = faker.number.float({ min: 0, max: total });
  for (const [i, item] of items.entries()) {
    roll -= weights[i]!;
    if (roll <= 0) return item;
  }
  return items.at(-1)!;
}

const COUNTRIES = [
  { value: "US", weight: 30 }, { value: "GB", weight: 12 }, { value: "DE", weight: 10 },
  { value: "TR", weight: 9 }, { value: "FR", weight: 8 }, { value: "BR", weight: 7 },
  { value: "NL", weight: 5 }, { value: "SE", weight: 4 }, { value: "JP", weight: 4 }, { value: null, weight: 6 },
] as const;
const SOURCES = [
  { value: "TRACK_PAGE", weight: 22 }, { value: "PROFILE", weight: 14 }, { value: "HOME", weight: 14 },
  { value: "DISCOVER", weight: 12 }, { value: "FEED", weight: 10 }, { value: "SEARCH", weight: 7 },
  { value: "COLLECTION", weight: 8 }, { value: "LIBRARY", weight: 5 }, { value: "EMBED", weight: 4 },
  { value: "CHARTS", weight: 4 },
] as const;
const KEYS = ["C major", "A minor", "G major", "E minor", "D major", "B minor", "F major", "D minor"];
const LICENSES = ["ALL_RIGHTS_RESERVED", "ALL_RIGHTS_RESERVED", "CC_BY", "CC_BY_NC", "CC_BY_SA"] as const;

type TrackSeed = Prisma.TrackCreateManyInput & { id: string; creatorId: string; publishedAt: Date | null };

async function main() {
  console.log("Preparing demo media in R2...");
  const manifest = await loadDemoManifest(r2, bucket);

  console.log("Removing previous seed data...");
  await db.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });

  // ------------------------------------------------------------------ users
  const password = await hashPassword(DEMO_PASSWORD);
  const usedUsernames = new Set<string>(["admin", "demo"]);
  const freshUsername = async (seed: string) =>
    firstFree(usernameBase(seed), async (c) => usedUsernames.has(c), 25, "_").then((u) => (usedUsernames.add(u), u));

  type SeedUser = Omit<Prisma.UserCreateManyInput, "id" | "username" | "createdAt"> & { id: string; username: string; createdAt: Date };
  const users: SeedUser[] = [];
  const addUser = async (
    input: Omit<Partial<Prisma.UserCreateManyInput>, "id" | "createdAt" | "username" | "email"> & { name: string; email?: string; username?: string; joinedDaysAgo: number },
  ) => {
    const username = input.username ?? (await freshUsername(input.name));
    if (input.username) usedUsernames.add(username);
    const { joinedDaysAgo, ...rest } = input;
    const user: SeedUser = {
      id: uuid(),
      email: `${username.replace(/_/g, "-")}@example.test`,
      emailVerified: true,
      onboardedAt: ago(joinedDaysAgo),
      createdAt: ago(joinedDaysAgo),
      favoriteGenres: faker.helpers.arrayElements(GENRES.map((g) => g.value), 3),
      ...rest,
      username,
    };
    users.push(user);
    return user;
  };

  const admin = await addUser({ name: "Site Admin", username: "admin", email: "admin@example.test", role: "ADMIN", joinedDaysAgo: 220 });
  const demo = await addUser({
    name: "Demo Listener",
    username: "demo",
    email: DEMO_EMAIL,
    bio: "The demo login: follows a few creators and has notifications waiting.",
    city: "Berlin",
    countryCode: "DE",
    joinedDaysAgo: 60,
  });
  const creators: SeedUser[] = [];
  for (let i = 0; i < 12; i++) {
    const name = faker.person.fullName();
    creators.push(
      await addUser({
        name,
        bio: faker.lorem.paragraphs({ min: 1, max: 2 }),
        city: faker.location.city(),
        countryCode: faker.helpers.weightedArrayElement(COUNTRIES.filter((c) => c.value)),
        plan: i === 3 || i === 7 ? "PRO" : "FREE",
        verified: i < 2,
        joinedDaysAgo: between(150, 210),
      }),
    );
  }
  const listeners: SeedUser[] = [];
  for (let i = 0; i < 40; i++) {
    listeners.push(await addUser({ name: faker.person.fullName(), joinedDaysAgo: between(5, 140) }));
  }
  const everyone = [admin, demo, ...creators, ...listeners];
  const demoCreator = demo; // the demo login also owns a few tracks so it has real notifications

  // ----------------------------------------------------------------- media
  const assetBase = { ownerId: admin.id, bucket, status: "ATTACHED" as const, uploadedAt: ago(200), attachedAt: ago(200), provider: "CLOUDFLARE_R2" as const };
  const url = (key: string) => (publicBase ? buildPublicObjectUrl(publicBase, key) : null);

  const audioAssets: { id: string; analysisId: string; audio: (typeof manifest.audio)[number] }[] = [];
  const mediaRows: Prisma.MediaAssetCreateManyInput[] = [];
  const analysisRows: Prisma.AudioAnalysisCreateManyInput[] = [];
  for (const audio of manifest.audio) {
    const id = uuid();
    const waveformId = uuid();
    mediaRows.push(
      { ...assetBase, id, kind: "AUDIO", storageKey: audio.key, originalFilename: audio.key.split("/").pop()!, mimeType: audio.mimeType, byteSize: BigInt(audio.byteSize) },
      { ...assetBase, id: waveformId, kind: "WAVEFORM", storageKey: audio.waveformKey, originalFilename: "overview.json", mimeType: "application/json" },
    );
    analysisRows.push({ audioAssetId: id, status: "READY", durationMs: audio.durationMs, sampleRate: 22_050, channels: 1, overviewWaveformAssetId: waveformId, completedAt: ago(200) });
    audioAssets.push({ id, analysisId: id, audio });
  }
  const imageAsset = (image: DemoImage, purpose: "ARTWORK" | "AVATAR" | "BANNER") => {
    const id = uuid();
    mediaRows.push({
      ...assetBase, id, kind: "IMAGE", imagePurpose: purpose, storageKey: image.storageKey,
      originalFilename: image.storageKey.split("/").slice(-2, -1)[0] + ".webp", mimeType: "image/webp",
      byteSize: BigInt(image.byteSize), imageWidths: image.imageWidths, publicUrl: url(image.storageKey),
    });
    return id;
  };
  const artworkIds = faker.helpers.shuffle(manifest.artwork).map((image) => imageAsset(image, "ARTWORK"));
  const avatarSources = faker.helpers.shuffle(manifest.avatars);
  const bannerSources = faker.helpers.shuffle(manifest.banners);
  let artworkCursor = 0;
  const nextArtwork = () => artworkIds[artworkCursor++ % artworkIds.length]!;

  // Every creator (and the demo login) gets an avatar; creators also a banner.
  let avatarCursor = 0;
  for (const user of [demo, ...creators, ...listeners.slice(0, 14)]) {
    user.avatarAssetId = imageAsset(avatarSources[avatarCursor++ % avatarSources.length]!, "AVATAR");
  }
  creators.forEach((user, i) => (user.bannerAssetId = imageAsset(bannerSources[i % bannerSources.length]!, "BANNER")));

  // ---------------------------------------------------------------- tracks
  const tracks: TrackSeed[] = [];
  const slugsByCreator = new Map<string, Set<string>>();
  const trackTitles = new Set<string>();
  const addTrack = (
    creator: SeedUser,
    options: {
      publishedAt: Date | null;
      visibility?: "PUBLIC" | "PRIVATE" | "SCHEDULED";
      publishAt?: Date;
      artworkAssetId: string | null;
      genre?: string;
      title?: string;
    },
  ): TrackSeed => {
    let title = options.title ?? songTitle();
    while (trackTitles.has(`${creator.id}:${title}`)) title = `${songTitle()} ${faker.word.noun()}`;
    trackTitles.add(`${creator.id}:${title}`);
    const slugs = slugsByCreator.get(creator.id) ?? new Set<string>();
    slugsByCreator.set(creator.id, slugs);
    let slug = slugBase(title);
    for (let n = 2; slugs.has(slug); n++) slug = `${slugBase(title)}-${n}`;
    slugs.add(slug);

    const { audio, id: audioAssetId } = pick(audioAssets);
    const genre = options.genre ?? pick(GENRES.slice(0, 30)).value;
    const track: TrackSeed = {
      id: uuid(),
      creatorId: creator.id,
      slug,
      title,
      artistName: faker.number.int(9) === 0 ? faker.music.artist() : null,
      description: faker.number.int(3) === 0 ? null : faker.lorem.sentences({ min: 1, max: 3 }),
      genre,
      tags: normalizeTags([genre.replace(/-/g, " "), faker.word.adjective(), faker.word.noun(), faker.word.noun()]),
      visibility: options.visibility ?? "PUBLIC",
      publishAt: options.publishAt ?? null,
      publishedAt: options.publishedAt,
      secretToken: newSecretToken(),
      audioAssetId,
      artworkAssetId: options.artworkAssetId,
      durationMs: audio.durationMs,
      mimeType: audio.mimeType,
      license: pick(LICENSES),
      bpm: faker.number.int(2) ? between(70, 170) : null,
      musicalKey: faker.number.int(2) ? pick(KEYS) : null,
      explicit: faker.number.int(14) === 0,
      downloadable: faker.number.int(5) === 0,
      createdAt: options.publishedAt ?? NOW,
    };
    tracks.push(track);
    return track;
  };
  const publishedBetween = (creator: SeedUser) =>
    new Date(between(creator.createdAt.getTime() + DAY, NOW.getTime() - 2 * 3_600_000));

  // standalone tracks
  for (const creator of creators) {
    for (let i = 0; i < between(4, 5); i++) addTrack(creator, { publishedAt: publishedBetween(creator), artworkAssetId: nextArtwork() });
  }
  for (let i = 0; i < 3; i++) addTrack(demoCreator, { publishedAt: ago(between(3, 40)), artworkAssetId: nextArtwork() });

  // collections: albums, EPs, singles and a compilation by the first six creators
  type CollectionSeed = Prisma.CollectionCreateManyInput & { id: string; ownerId: string; publishedAt: Date | null };
  const collections: CollectionSeed[] = [];
  const collectionTracks: Prisma.CollectionTrackCreateManyInput[] = [];
  const RELEASES = [
    { type: "ALBUM", tracks: 5 }, { type: "EP", tracks: 3 }, { type: "SINGLE", tracks: 1 },
    { type: "ALBUM", tracks: 4 }, { type: "EP", tracks: 4 }, { type: "COMPILATION", tracks: 5 },
  ] as const;
  const collectionSlugs = new Map<string, Set<string>>();
  const addCollection = (
    owner: SeedUser,
    options: { type: "PLAYLIST" | "ALBUM" | "EP" | "SINGLE" | "COMPILATION"; title: string; publishedAt: Date; visibility?: "PUBLIC" | "PRIVATE"; genre?: string },
  ) => {
    const slugs = collectionSlugs.get(owner.id) ?? new Set<string>();
    collectionSlugs.set(owner.id, slugs);
    let slug = slugBase(options.title);
    for (let n = 2; slugs.has(slug); n++) slug = `${slugBase(options.title)}-${n}`;
    slugs.add(slug);
    const collection: CollectionSeed = {
      id: uuid(),
      ownerId: owner.id,
      slug,
      type: options.type,
      title: options.title,
      description: faker.number.int(2) ? faker.lorem.sentences({ min: 1, max: 3 }) : null,
      genre: options.genre ?? null,
      tags: normalizeTags([faker.word.adjective(), faker.word.noun()]),
      visibility: options.visibility ?? "PUBLIC",
      secretToken: newSecretToken(),
      publishedAt: options.publishedAt,
      releaseDate: options.type === "PLAYLIST" ? null : options.publishedAt,
      license: options.type === "PLAYLIST" ? null : "ALL_RIGHTS_RESERVED",
      artworkAssetId: nextArtwork(),
      createdAt: options.publishedAt,
    };
    collections.push(collection);
    return collection;
  };
  const addToCollection = (collection: CollectionSeed, track: TrackSeed, position: number) =>
    collectionTracks.push({ collectionId: collection.id, trackId: track.id, position, addedById: collection.ownerId, addedAt: collection.publishedAt ?? NOW });

  for (const [i, release] of RELEASES.entries()) {
    const owner = creators[i]!;
    const publishedAt = ago(between(4, 120));
    const genre = pick(GENRES.slice(0, 30)).value;
    const collection = addCollection(owner, {
      type: release.type,
      title: release.type === "SINGLE" ? songTitle() : `${faker.word.adjective()} ${faker.word.noun()}`.replace(/\b\w/g, (c) => c.toUpperCase()),
      publishedAt,
      genre,
    });
    for (let position = 0; position < release.tracks; position++) {
      const track = addTrack(owner, { publishedAt, artworkAssetId: collection.artworkAssetId!, genre });
      addToCollection(collection, track, position);
    }
  }

  // private + scheduled tracks (J7, J8)
  const privateTracks = [1, 2, 4].map((i) => addTrack(creators[i]!, { publishedAt: null, visibility: "PRIVATE", artworkAssetId: nextArtwork() }));
  const scheduledTrack = addTrack(creators[3]!, {
    publishedAt: new Date(NOW.getTime() + 2 * DAY),
    visibility: "SCHEDULED",
    publishAt: new Date(NOW.getTime() + 2 * DAY),
    artworkAssetId: nextArtwork(),
  });

  const isPublicNow = (track: TrackSeed) => track.visibility === "PUBLIC";
  const publicTracks = tracks.filter(isPublicNow);

  // playlists mixing creators (some owned by listeners)
  const playlistOwners = [creators[0]!, creators[2]!, creators[5]!, creators[9]!, listeners[0]!, listeners[1]!, listeners[2]!, demo];
  for (const [i, owner] of playlistOwners.entries()) {
    const playlist = addCollection(owner, {
      type: "PLAYLIST",
      title: pick(["Late-night drive", "Sunday morning", "Focus", "Workout mix", "Rainy day", "Road trip", "Deep cuts", "New finds"]) + (i > 7 ? ` ${i}` : ""),
      publishedAt: ago(between(2, 90)),
      visibility: i === 6 ? "PRIVATE" : "PUBLIC",
    });
    faker.helpers.arrayElements(publicTracks, between(6, 12)).forEach((track, position) => addToCollection(playlist, track, position));
  }

  // -------------------------------------------------------- persist content
  console.log(`Writing ${users.length} users, ${tracks.length} tracks, ${collections.length} collections...`);
  // Users first (assets are owned by the admin), avatars/banners are attached once the assets exist.
  await db.user.createMany({ data: users.map(({ avatarAssetId: _a, bannerAssetId: _b, ...u }) => u) });
  await db.account.createMany({
    data: users.map((u) => ({ id: uuid(), accountId: u.id, providerId: "credential", userId: u.id, password, createdAt: u.createdAt, updatedAt: u.createdAt })),
  });
  await db.mediaAsset.createMany({ data: mediaRows });
  await db.audioAnalysis.createMany({ data: analysisRows });
  for (const user of users) {
    if (user.avatarAssetId || user.bannerAssetId) {
      await db.user.update({
        where: { id: user.id },
        data: { avatarAssetId: user.avatarAssetId ?? null, bannerAssetId: user.bannerAssetId ?? null },
      });
    }
  }
  await db.track.createMany({ data: tracks });
  await db.collection.createMany({ data: collections });
  await db.collectionTrack.createMany({ data: collectionTracks });

  // activity: releases appear once as the collection, not once per track
  const inCollection = new Set(collectionTracks.map((ct) => ct.trackId));
  await db.activity.createMany({
    data: [
      ...publicTracks
        .filter((t) => !inCollection.has(t.id))
        .map((t) => ({ actorId: t.creatorId, type: "TRACK_POSTED" as const, trackId: t.id, createdAt: t.publishedAt! })),
      ...collections
        .filter((c) => c.visibility === "PUBLIC")
        .map((c) => ({ actorId: c.ownerId, type: "COLLECTION_POSTED" as const, collectionId: c.id, createdAt: c.publishedAt! })),
    ],
  });

  // spotlight: one item for free creators, three for Pro
  const spotlight: Prisma.SpotlightItemCreateManyInput[] = [];
  for (const creator of creators.slice(0, 8)) {
    const own = tracks.filter((t) => t.creatorId === creator.id && isPublicNow(t));
    const count = creator.plan === "PRO" ? 3 : 1;
    own.slice(0, count).forEach((track, position) => spotlight.push({ userId: creator.id, position, trackId: track.id }));
  }
  await db.spotlightItem.createMany({ data: spotlight });

  // -------------------------------------------------------------- social graph
  console.log("Generating follows, likes, reposts, comments and plays...");
  const creatorWeights = popularity(creators.length, 0.8);
  const follows = new Map<string, { followerId: string; followingId: string; createdAt: Date }>();
  const follow = (follower: SeedUser, following: SeedUser) => {
    if (follower.id === following.id) return;
    const createdAt = new Date(between(Math.max(follower.createdAt.getTime(), following.createdAt.getTime()), NOW.getTime()));
    follows.set(`${follower.id}>${following.id}`, { followerId: follower.id, followingId: following.id, createdAt });
  };
  for (const listener of [demo, ...listeners]) {
    for (let i = 0; i < between(3, 9); i++) follow(listener, weightedPick(creators, creatorWeights));
  }
  for (const creator of creators) {
    for (let i = 0; i < between(1, 4); i++) follow(creator, pick(creators));
  }
  creators.slice(0, 6).forEach((creator) => follow(demo, creator));
  creators.slice(0, 4).forEach((creator) => follow(creator, demo));
  await db.follow.createMany({ data: [...follows.values()] });

  const trackWeights = popularity(publicTracks.length);
  const likes = new Map<string, Prisma.TrackLikeCreateManyInput>();
  const likers = [...listeners, demo, ...creators];
  for (const liker of likers) {
    const count = liker === demo ? 24 : between(8, 38);
    for (let i = 0; i < count; i++) {
      const track = weightedPick(publicTracks, trackWeights);
      if (track.creatorId === liker.id) continue; // VI-2: nobody likes their own track
      const createdAt = new Date(between(Math.max(track.publishedAt!.getTime(), liker.createdAt.getTime()), NOW.getTime()));
      likes.set(`${liker.id}:${track.id}`, { userId: liker.id, trackId: track.id, createdAt });
    }
  }
  await db.trackLike.createMany({ data: [...likes.values()] });

  const publicCollections = collections.filter((c) => c.visibility === "PUBLIC");
  const collectionLikes = new Map<string, Prisma.CollectionLikeCreateManyInput>();
  for (const liker of likers) {
    for (let i = 0; i < between(1, 4); i++) {
      const collection = pick(publicCollections);
      if (collection.ownerId === liker.id) continue;
      collectionLikes.set(`${liker.id}:${collection.id}`, { userId: liker.id, collectionId: collection.id, createdAt: new Date(between(collection.publishedAt!.getTime(), NOW.getTime())) });
    }
  }
  await db.collectionLike.createMany({ data: [...collectionLikes.values()] });

  const trackReposts = new Map<string, Prisma.TrackRepostCreateManyInput>();
  for (const reposter of [...listeners.slice(0, 25), ...creators]) {
    for (let i = 0; i < between(1, 5); i++) {
      const track = weightedPick(publicTracks, trackWeights);
      if (track.creatorId === reposter.id) continue;
      trackReposts.set(`${reposter.id}:${track.id}`, { userId: reposter.id, trackId: track.id, createdAt: new Date(between(track.publishedAt!.getTime(), NOW.getTime())) });
    }
  }
  await db.trackRepost.createMany({ data: [...trackReposts.values()] });
  const collectionReposts = new Map<string, Prisma.CollectionRepostCreateManyInput>();
  for (const reposter of [...listeners.slice(0, 10), ...creators.slice(0, 5)]) {
    const collection = pick(publicCollections);
    if (collection.ownerId === reposter.id) continue;
    collectionReposts.set(`${reposter.id}:${collection.id}`, { userId: reposter.id, collectionId: collection.id, createdAt: new Date(between(collection.publishedAt!.getTime(), NOW.getTime())) });
  }
  await db.collectionRepost.createMany({ data: [...collectionReposts.values()] });
  await db.activity.createMany({
    data: [
      ...[...trackReposts.values()].map((r) => ({ actorId: r.userId, type: "TRACK_REPOSTED" as const, trackId: r.trackId, createdAt: r.createdAt as Date })),
      ...[...collectionReposts.values()].map((r) => ({ actorId: r.userId, type: "COLLECTION_REPOSTED" as const, collectionId: r.collectionId, createdAt: r.createdAt as Date })),
    ],
  });

  // timed comments with replies and likes
  const commenters = [...listeners, ...creators, demo];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const replies: Prisma.CommentCreateManyInput[] = [];
  const commentLikes = new Map<string, Prisma.CommentLikeCreateManyInput>();
  const COMMENT_LINES = [
    "This drop at the end is unreal", "Love the bassline here", "Goosebumps", "Is this a Juno?", "Replaying this section on loop",
    "That transition!", "Pure vibes", "Needs to be on vinyl", "The pads are gorgeous", "What a groove", "Instant favourite",
    "Mix is so clean", "Chills at this part", "Who else is here after the Feed post?", "Came for the artwork, stayed for the track",
  ];
  for (let i = 0; i < 260; i++) {
    const track = weightedPick(publicTracks, trackWeights);
    const author = pick(commenters);
    const timed = faker.number.int(9) < 6;
    const id = uuid();
    const createdAt = new Date(between(Math.max(track.publishedAt!.getTime(), author.createdAt.getTime()), NOW.getTime()));
    comments.push({
      id, authorId: author.id, trackId: track.id, content: pick(COMMENT_LINES),
      timestampSeconds: timed ? between(1, Math.floor(track.durationMs / 1000)) : null, createdAt,
    });
    if (faker.number.int(9) < 3) {
      for (let r = 0; r < between(1, 3); r++) {
        const replier = r === 0 && faker.number.int(1) ? users.find((u) => u.id === track.creatorId)! : pick(commenters);
        replies.push({
          id: uuid(), authorId: replier.id, trackId: track.id, parentId: id,
          content: pick(["Thank you!", "Appreciate it", "Right?!", "Same here", "Glad you like it"]),
          createdAt: new Date(createdAt.getTime() + between(1, 48) * 3_600_000),
        });
      }
    }
    for (let l = 0; l < between(0, 4); l++) {
      const liker = pick(commenters);
      if (liker.id !== author.id) commentLikes.set(`${liker.id}:${id}`, { userId: liker.id, commentId: id });
    }
  }
  await db.comment.createMany({ data: comments });
  await db.comment.createMany({ data: replies });
  await db.commentLike.createMany({ data: [...commentLikes.values()] });

  // ~9000 plays over the last 120 days, biased towards popular and recent tracks
  const recentWeight = (track: TrackSeed) => 1 + Math.max(0, 1 - (NOW.getTime() - track.publishedAt!.getTime()) / (60 * DAY)) * 3;
  const playWeights = publicTracks.map((track, i) => trackWeights[i]! * recentWeight(track));
  const plays: Prisma.PlayEventCreateManyInput[] = [];
  for (let i = 0; i < 9000; i++) {
    const track = weightedPick(publicTracks, playWeights);
    const earliest = Math.max(track.publishedAt!.getTime(), NOW.getTime() - 120 * DAY);
    const createdAt = new Date(earliest + (NOW.getTime() - earliest) * faker.number.float({ min: 0, max: 1 }) ** 0.7);
    const signedIn = faker.number.int(9) < 6;
    const listener = signedIn ? pick(listeners) : null;
    const completed = faker.number.int(9) < 6;
    plays.push({
      trackId: track.id,
      listenerId: listener?.id ?? null,
      clientHash: listener ? null : faker.string.hexadecimal({ length: 64, casing: "lower", prefix: "" }),
      source: faker.helpers.weightedArrayElement(SOURCES),
      countryCode: faker.helpers.weightedArrayElement(COUNTRIES),
      counted: true,
      listenedMs: completed ? Math.round(track.durationMs * 0.95) : between(5_000, Math.max(6_000, Math.floor(track.durationMs * 0.6))),
      completed,
      createdAt,
    });
  }
  for (const part of chunk(plays, 2000)) await db.playEvent.createMany({ data: part });

  // ------------------------------------------------- notifications for the demo login
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const demoTracks = tracks.filter((t) => t.creatorId === demo.id);
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const [i, creator] of creators.slice(0, 4).entries()) {
    const createdAt = ago(i * 2 + 0.1);
    notifications.push({ recipientId: demo.id, actorId: creator.id, type: "FOLLOW", groupKey: `FOLLOW:${demo.id}:${day(createdAt)}`, createdAt, readAt: i > 1 ? ago(i) : null });
  }
  for (const [i, liker] of listeners.slice(0, 6).entries()) {
    const track = demoTracks[i % demoTracks.length]!;
    const createdAt = ago(0.2 + i * 0.1);
    notifications.push({ recipientId: demo.id, actorId: liker.id, type: "TRACK_LIKE", trackId: track.id, groupKey: `TRACK_LIKE:${track.id}:${day(createdAt)}`, createdAt });
  }
  const demoComment = comments.find((c) => demoTracks.some((t) => t.id === c.trackId));
  if (demoComment) {
    notifications.push({
      recipientId: demo.id, actorId: demoComment.authorId, type: "COMMENT", trackId: demoComment.trackId, commentId: demoComment.id,
      groupKey: `COMMENT:${demoComment.trackId}:${day(demoComment.createdAt as Date)}`, createdAt: demoComment.createdAt,
    });
  }
  notifications.push({ recipientId: demo.id, type: "SYSTEM", message: "Welcome to Music Stream! This is the demo account.", groupKey: `SYSTEM:${demo.id}:${day(ago(60))}`, createdAt: ago(60), readAt: ago(59) });
  await db.notification.createMany({ data: notifications });

  console.log("Recomputing counters and daily statistics...");
  await recountAll(db);

  console.log("\nSeed done.");
  console.log(`  demo login:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}   (profile /demo)`);
  console.log(`  admin login: admin@example.test / ${DEMO_PASSWORD}`);
  console.log(`  creators:    ${creators.map((c) => `/${c.username}`).slice(0, 4).join(", ")} ...`);
  for (const track of privateTracks) {
    const owner = users.find((u) => u.id === track.creatorId)!;
    console.log(`  private:     /${owner.username}/${track.slug}  secret link: /${owner.username}/${track.slug}/s-${track.secretToken}`);
  }
  const scheduledOwner = users.find((u) => u.id === scheduledTrack.creatorId)!;
  console.log(`  scheduled:   /${scheduledOwner.username}/${scheduledTrack.slug}  (publishes ${new Date(scheduledTrack.publishAt!).toISOString()})`);
  void everyone;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
