import { db } from "@/server/db";
import { createCaller } from "@/server/api/root";
import { resetClock, setClock } from "@/server/clock";
import { newSecretToken } from "@/server/modules/tokens";

const created: string[] = [];
const usernames = new Map<string, string>();

type Visibility = "PUBLIC" | "PRIVATE" | "SCHEDULED";

/** A valid, unique username for a test user (3-25 chars, lowercase). */
const uniqueUsername = (label: string) =>
  `${label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "u"}-${crypto.randomUUID().replaceAll("-", "").slice(0, 9)}`;

export async function createUser(
  label: string,
  opts: { plan?: "FREE" | "PRO"; status?: "ACTIVE" | "SUSPENDED" | "DELETED"; role?: "USER" | "ADMIN"; emailVerified?: boolean } = {},
) {
  const id = crypto.randomUUID();
  const username = uniqueUsername(label);
  await db.user.create({
    data: {
      id,
      name: `it-${label}`,
      username,
      email: `it-${label}-${id}@example.test`,
      emailVerified: opts.emailVerified ?? true,
      ...(opts.plan ? { plan: opts.plan } : {}),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.role ? { role: opts.role } : {}),
    },
  });
  created.push(id);
  usernames.set(id, username);
  return id;
}

export const usernameOf = (userId: string) => usernames.get(userId)!;

/** Removing the users cascades to their assets, tracks and collections. */
export async function cleanup() {
  resetClock();
  await db.user.deleteMany({ where: { id: { in: created } } });
  created.length = 0;
}

/** Counters and limits are per user per window: tests that hammer one action start from a clean slate. */
export async function resetRateLimits() {
  await db.rateLimitBucket.deleteMany();
}

export const freezeClock = (at: Date) => setClock(() => at);
export { resetClock };

export async function createAsset(
  ownerId: string,
  opts: { kind?: "AUDIO" | "IMAGE"; status?: "PENDING" | "READY" | "ATTACHED"; durationMs?: number } = {},
) {
  const kind = opts.kind ?? "AUDIO";
  const status = opts.status ?? "READY";
  const prefix = kind === "AUDIO" ? "uploads" : "artworks";
  const asset = await db.mediaAsset.create({
    data: {
      ownerId,
      kind,
      status,
      bucket: "test-bucket",
      storageKey: `${prefix}/${ownerId}/${crypto.randomUUID()}-file`,
      originalFilename: "file",
      mimeType: kind === "AUDIO" ? "audio/mpeg" : "image/png",
      ...(kind === "IMAGE" ? { imagePurpose: "ARTWORK" as const } : {}),
    },
  });
  // Uploaded audio carries its analysis once it is READY (markUploadComplete writes both).
  if (kind === "AUDIO" && status !== "PENDING") {
    await db.audioAnalysis.create({
      data: { audioAssetId: asset.id, status: "READY", durationMs: opts.durationMs ?? 120_000, sampleRate: 44_100, channels: 2 },
    });
  }
  return asset;
}

export interface TrackOptions {
  title?: string;
  slug?: string;
  visibility?: Visibility;
  publishAt?: Date;
  publishedAt?: Date | null;
  moderationState?: "VISIBLE" | "REMOVED";
  genre?: string;
  tags?: string[];
  durationMs?: number;
  playCount?: number;
  likeCount?: number;
  commentsEnabled?: boolean;
  statsPublic?: boolean;
  artworkAssetId?: string;
}

/** A published track (audio asset ATTACHED + analysis READY). Public by default, published now. */
export async function createTrack(ownerId: string, opts: TrackOptions = {}) {
  const asset = await createAsset(ownerId, { status: "ATTACHED", durationMs: opts.durationMs ?? 30_000 });
  const visibility = opts.visibility ?? "PUBLIC";
  const title = opts.title ?? "track";
  return db.track.create({
    data: {
      creatorId: ownerId,
      slug: opts.slug ?? `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`,
      title,
      audioAssetId: asset.id,
      artworkAssetId: opts.artworkAssetId,
      visibility,
      publishAt: opts.publishAt,
      publishedAt: opts.publishedAt === undefined ? (visibility === "PRIVATE" ? null : new Date()) : opts.publishedAt,
      moderationState: opts.moderationState,
      genre: opts.genre,
      tags: opts.tags,
      secretToken: newSecretToken(),
      durationMs: opts.durationMs ?? 30_000,
      mimeType: "audio/mpeg",
      playCount: opts.playCount,
      likeCount: opts.likeCount,
      commentsEnabled: opts.commentsEnabled,
      statsPublic: opts.statsPublic,
    },
  });
}

export async function createCollection(
  ownerId: string,
  opts: {
    title?: string;
    type?: "PLAYLIST" | "ALBUM" | "EP" | "SINGLE" | "COMPILATION";
    visibility?: "PUBLIC" | "PRIVATE";
    trackIds?: string[];
    moderationState?: "VISIBLE" | "REMOVED";
  } = {},
) {
  const title = opts.title ?? "collection";
  const type = opts.type ?? "ALBUM";
  const trackIds = opts.trackIds ?? [];
  const collection = await db.collection.create({
    data: {
      ownerId,
      slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`,
      type,
      title,
      visibility: opts.visibility ?? "PUBLIC",
      secretToken: newSecretToken(),
      publishedAt: new Date(),
      releaseDate: type === "PLAYLIST" ? null : new Date(),
      moderationState: opts.moderationState,
      trackCount: trackIds.length,
    },
  });
  for (const [position, trackId] of trackIds.entries()) {
    await db.collectionTrack.create({ data: { collectionId: collection.id, trackId, position, addedById: ownerId } });
  }
  return collection;
}

/** tRPC caller acting as `userId`, or anonymous when omitted. */
export function callerFor(userId?: string) {
  const session = userId
    ? { user: { id: userId, username: usernames.get(userId) }, session: { userId } }
    : null;
  return createCaller({ db, session, headers: new Headers() } as never);
}

export { db };
