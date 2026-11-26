import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { blockedEitherWay } from "@/server/modules/social/blocks";
import { jaccard } from "@/server/modules/recommendations/scoring";
import { accessibleTrackWhere, publicTrackWhere } from "@/server/modules/visibility";

/** At most this many related tracks may come from one creator, so a sidebar is not a single artist's catalogue. */
export const RELATED_PER_CREATOR = 2;

/**
 * "Related tracks" (TR-8) and the autoplay continuation (PL-P5): public tracks only, never the seed,
 * best signal first: other tracks of the same creator (at most two), tracks liked by people who liked
 * this one, then tracks sharing the genre or a tag, newest first. Hidden tracks never appear.
 */
export async function relatedTracks(
  db: PrismaClient,
  { trackId, viewerId = null, limit = 20, now = clockNow() }: { trackId: string; viewerId?: string | null; limit?: number; now?: Date },
) {
  const seed = await db.track.findFirst({
    where: { id: trackId, ...accessibleTrackWhere(viewerId, now) },
    select: { id: true, creatorId: true, genre: true, tags: true },
  });
  // A hidden seed (secret link) has no public signals worth sharing: answer empty.
  if (!seed) return [];

  const blocked = await blockedEitherWay(db, viewerId);
  const visible = { ...publicTrackWhere(now), id: { not: seed.id }, creator: { status: "ACTIVE" as const, ...(blocked.size ? { id: { notIn: [...blocked] } } : {}) } };
  const select = { ...trackDtoSelect, ...likedByMeSelect(viewerId) };
  const take = limit * 2;

  const [sameCreator, coLiked, similar] = await Promise.all([
    db.track.findMany({ where: { ...visible, creatorId: seed.creatorId }, orderBy: [{ playCount: "desc" }, { id: "asc" }], take: RELATED_PER_CREATOR, select }),
    db.track.findMany({
      where: { ...visible, creatorId: { not: seed.creatorId }, likes: { some: { user: { trackLikes: { some: { trackId: seed.id } } } } } },
      orderBy: [{ likeCount: "desc" }, { id: "asc" }],
      take,
      select,
    }),
    seed.genre || seed.tags.length > 0
      ? db.track.findMany({
          where: {
            ...visible,
            creatorId: { not: seed.creatorId },
            // AND, not a second `OR` key: that would replace the visibility filter of `visible`.
            AND: [{ OR: [...(seed.genre ? [{ genre: seed.genre }] : []), ...(seed.tags.length > 0 ? [{ tags: { hasSome: seed.tags } }] : [])] }],
          },
          orderBy: [{ playCount: "desc" }, { id: "asc" }],
          take,
          select,
        })
      : Promise.resolve([]),
  ]);

  // RC-3: among the genre/tag matches, same genre and shared tags (Jaccard) come first, then popularity (already the query order).
  const rankSimilar = (row: (typeof similar)[number]) => (row.genre && row.genre === seed.genre ? 1 : 0) + 2 * jaccard(row.tags, seed.tags);
  const similarRanked = [...similar].sort((a, b) => rankSimilar(b) - rankSimilar(a));

  const seen = new Set<string>();
  const perCreator = new Map<string, number>();
  const picked = [];
  for (const row of [...sameCreator, ...coLiked, ...similarRanked]) {
    if (seen.has(row.id)) continue;
    const count = perCreator.get(row.creatorId) ?? 0;
    if (count >= RELATED_PER_CREATOR) continue;
    seen.add(row.id);
    perCreator.set(row.creatorId, count + 1);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked.map((row) => toTrackDto(row, { viewerId }));
}
