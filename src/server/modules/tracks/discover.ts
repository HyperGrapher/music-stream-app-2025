import type { Prisma } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { publicTrackWhere } from "@/server/modules/visibility";

export const DISCOVER_SORTS = ["latest", "popular"] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];

/** Public tracks only, optionally narrowed by genre and a title / artist search. */
export function discoverWhere(
  filter: { genre?: string; q?: string },
  now: Date = clockNow(),
): Prisma.TrackWhereInput {
  const q = filter.q?.trim();
  return {
    AND: [
      publicTrackWhere(now),
      ...(filter.genre ? [{ genre: filter.genre }] : []),
      ...(q
        ? [
            {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { artistName: { contains: q, mode: "insensitive" as const } },
                { creator: { name: { contains: q, mode: "insensitive" as const } } },
                { creator: { username: { contains: q.toLowerCase() } } },
              ],
            },
          ]
        : []),
    ],
  };
}

/** Deterministic: ties are broken so paging/refreshing never reshuffles equal tracks. */
export function discoverOrderBy(
  sort: DiscoverSort,
): Prisma.TrackOrderByWithRelationInput[] {
  return sort === "popular"
    ? [
        { playCount: "desc" },
        { likeCount: "desc" },
        { publishedAt: "desc" },
        { id: "asc" },
      ]
    : [{ publishedAt: "desc" }, { id: "asc" }];
}
