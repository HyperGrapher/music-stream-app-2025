import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeUsername, USERNAME_PATTERN, usernameBase } from "@/lib/names";
import { isReservedName } from "@/server/modules/reserved";
import { enqueueStorageDeletion } from "@/server/modules/storage/deletion";
import { imageObjectKeys } from "@/lib/artwork";
import { now as clockNow } from "@/server/clock";
import { setFollow } from "@/server/modules/social/follow";

type Tx = Prisma.TransactionClient;
const THIRTY_DAYS_MS = 30 * 86_400_000;

export type UsernameCheck =
  | { available: true; username: string }
  | { available: false; username: string; reason: "INVALID" | "RESERVED" | "TAKEN"; suggestions: string[] };

/** Is `candidate` free for `selfId`? A name is taken by a user, or held by someone's recent rename (30 days). */
async function isTaken(db: Pick<PrismaClient, "user" | "usernameRedirect">, name: string, selfId: string | null, now: Date) {
  const user = await db.user.findUnique({ where: { username: name }, select: { id: true } });
  if (user && user.id !== selfId) return true;
  const held = await db.usernameRedirect.findUnique({ where: { oldUsername: name }, select: { userId: true, createdAt: true } });
  return held !== null && held.userId !== selfId && held.createdAt.getTime() > now.getTime() - THIRTY_DAYS_MS;
}

/** Live availability check for onboarding / settings (PRD 6.2): shape, reserved words, uniqueness, suggestions. */
export async function checkUsername(
  db: Pick<PrismaClient, "user" | "usernameRedirect" | "reservedName">,
  candidate: string,
  selfId: string | null = null,
  now: Date = clockNow(),
): Promise<UsernameCheck> {
  const username = normalizeUsername(candidate);
  const suggest = async () => {
    const out: string[] = [];
    const base = usernameBase(username || "user");
    for (const option of [`${base}_music`.slice(0, 25), `${base}1`, `${base}_`, `the_${base}`.slice(0, 25), `${base}_official`.slice(0, 25)]) {
      if (USERNAME_PATTERN.test(option) && !(await isReservedName(db, option)) && !(await isTaken(db, option, selfId, now))) out.push(option);
      if (out.length === 3) break;
    }
    return out;
  };
  if (!USERNAME_PATTERN.test(username)) return { available: false, username, reason: "INVALID", suggestions: [] };
  if (await isReservedName(db, username)) return { available: false, username, reason: "RESERVED", suggestions: await suggest() };
  if (await isTaken(db, username, selfId, now)) return { available: false, username, reason: "TAKEN", suggestions: await suggest() };
  return { available: true, username };
}

/**
 * Renames a user (IA-4): the old name keeps redirecting for 30 days and is held for its owner;
 * taking back one of your own old names drops that redirect. Race-safe through the unique index.
 */
export async function changeUsername(db: PrismaClient, userId: string, requested: string, now: Date = clockNow()) {
  const username = normalizeUsername(requested);
  const check = await checkUsername(db, username, userId, now);
  if (!check.available) {
    throw new TRPCError({
      code: check.reason === "TAKEN" ? "CONFLICT" : "BAD_REQUEST",
      message: check.reason === "TAKEN" ? "That username is taken" : check.reason === "RESERVED" ? "That username is reserved" : "Use 3-25 letters, numbers, - or _",
    });
  }
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
      if (current.username === username) return username;
      await tx.usernameRedirect.deleteMany({ where: { oldUsername: username, userId } });
      // A stale redirect (older than 30 days) held by someone else no longer protects the name.
      await tx.usernameRedirect.deleteMany({ where: { oldUsername: username } });
      await tx.user.update({ where: { id: userId }, data: { username } });
      await tx.usernameRedirect.upsert({
        where: { oldUsername: current.username },
        create: { oldUsername: current.username, userId, createdAt: now },
        update: { userId, createdAt: now },
      });
      return username;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new TRPCError({ code: "CONFLICT", message: "That username is taken" });
    throw error;
  }
}

/**
 * Swaps the avatar or banner of a user: claims the new READY image (purpose must match), detaches
 * the old one and queues its renditions for deletion. `null` removes the image.
 */
export async function setUserImage(
  tx: Tx,
  userId: string,
  kind: "avatar" | "banner",
  assetId: string | null,
  now: Date = clockNow(),
) {
  const purpose = kind === "avatar" ? "AVATAR" : "BANNER";
  const field = kind === "avatar" ? "avatarAssetId" : "bannerAssetId";
  if (assetId) {
    const claimed = await tx.mediaAsset.updateMany({
      where: { id: assetId, ownerId: userId, kind: "IMAGE", imagePurpose: purpose, status: "READY" },
      data: { status: "ATTACHED", attachedAt: now, expiresAt: null },
    });
    if (claimed.count !== 1) {
      throw new TRPCError({ code: "CONFLICT", message: "The image is not ready or was already used" });
    }
  }
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarAssetId: true, bannerAssetId: true } });
  const previousId = user[field];
  await tx.user.update({ where: { id: userId }, data: { [field]: assetId } });
  if (previousId && previousId !== assetId) {
    const old = await tx.mediaAsset.findUnique({ where: { id: previousId } });
    if (old) {
      await enqueueStorageDeletion(tx, old.bucket, imageObjectKeys(old));
      await tx.mediaAsset.delete({ where: { id: old.id } });
    }
  }
}

export interface OnboardingInput {
  username: string;
  name: string;
  avatarAssetId?: string | null;
  genres: string[];
  follow: string[];
}

/**
 * Finishes onboarding (PRD 6.2): username (live-checked), display name, optional avatar, favourite
 * genres and the creators the user chose to follow. Marks the account onboarded.
 */
export async function completeOnboarding(db: PrismaClient, userId: string, input: OnboardingInput, now: Date = clockNow()) {
  const username = await changeUsername(db, userId, input.username, now);
  await db.$transaction(async (tx) => {
    if (input.avatarAssetId !== undefined) await setUserImage(tx, userId, "avatar", input.avatarAssetId, now);
    await tx.user.update({
      where: { id: userId },
      data: { name: input.name.trim(), favoriteGenres: input.genres, onboardedAt: now },
    });
  });
  for (const followingId of input.follow) {
    // A suggestion may have been blocked, deleted or hit a limit meanwhile: skip, never fail onboarding.
    await setFollow(db, { followerId: userId, followingId, follow: true, now }).catch(() => undefined);
  }
  return { username };
}

