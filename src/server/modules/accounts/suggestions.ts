import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { publicTrackWhere } from "@/server/modules/visibility";

interface SuggestionOptions {
  /** Genre slugs that seed the suggestions (onboarding, favourite genres). */
  genres?: string[];
  limit?: number;
  /** Extra users to leave out (e.g. already shown). */
  exclude?: string[];
}

/**
 * "Who to follow" (PRD FO-4, 6.2): creators with public tracks, ranked by how many of the people you
 * follow follow them (2 hops), then by matching genres, then by popularity. Excludes yourself, people
 * you already follow and anyone in a block relationship with you. Signed-out callers get popular creators.
 */
export async function whoToFollow(
  db: PrismaClient,
  userId: string | null,
  { genres = [], limit = 12, exclude = [] }: SuggestionOptions = {},
  now: Date = clockNow(),
) {
  const followed = userId
    ? (await db.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })).map((f) => f.followingId)
    : [];
  const blocked = userId
    ? (await db.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } })).flatMap((b) => [b.blockerId, b.blockedId])
    : [];
  const skip = new Set([...followed, ...blocked, ...exclude, ...(userId ? [userId] : [])]);

  const score = new Map<string, number>();
  if (followed.length > 0) {
    const hops = await db.follow.groupBy({
      by: ["followingId"],
      where: { followerId: { in: followed }, followingId: { notIn: [...skip] } },
      _count: { _all: true },
    });
    for (const hop of hops) score.set(hop.followingId, (score.get(hop.followingId) ?? 0) + hop._count._all * 3);
  }
  if (genres.length > 0) {
    const matching = await db.track.findMany({
      where: { AND: [publicTrackWhere(now), { genre: { in: genres } }, { creatorId: { notIn: [...skip] } }] },
      distinct: ["creatorId"],
      select: { creatorId: true },
      take: 200,
    });
    for (const { creatorId } of matching) score.set(creatorId, (score.get(creatorId) ?? 0) + 2);
  }

  const candidates = await db.user.findMany({
    where: {
      status: "ACTIVE",
      publicTrackCount: { gt: 0 },
      id: { notIn: [...skip] },
      OR: [{ id: { in: [...score.keys()] } }, { followerCount: { gte: 0 } }],
    },
    orderBy: [{ followerCount: "desc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true, name: true, username: true, image: true, verified: true, followerCount: true,
      avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
    },
  });
  const ranked = candidates
    .map((user) => ({ user, score: (score.get(user.id) ?? 0) + Math.log10(user.followerCount + 1) * 0.1 }))
    .sort((a, b) => b.score - a.score || a.user.username.localeCompare(b.user.username))
    .slice(0, limit)
    .map((entry) => entry.user);

  // Each suggestion carries its most played public track, so the card can offer a play button.
  const tops = await db.track.findMany({
    where: { AND: [publicTrackWhere(now), { creatorId: { in: ranked.map((u) => u.id) } }] },
    orderBy: [{ playCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
    select: trackDtoSelect,
  });
  const topByCreator = new Map<string, (typeof tops)[number]>();
  for (const track of tops) if (!topByCreator.has(track.creatorId)) topByCreator.set(track.creatorId, track);

  return ranked.map((user) => {
    const top = topByCreator.get(user.id);
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      image: userAvatarUrl(user),
      verified: user.verified,
      followerCount: user.followerCount,
      topTrack: top ? toTrackDto(top, {}) : null,
    };
  });
}
