import type { PrismaClient } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

/** GT-2: public tracks and collections carrying a tag, or the genre with that slug, Popular or Latest. */
export async function byTag(db: PrismaClient, rawTag: string, { sort = "popular", viewerId = null, now = clockNow() }: { sort?: "popular" | "latest"; viewerId?: string | null; now?: Date } = {}) {
  const tag = rawTag.trim().toLowerCase().replace(/^#/, "").slice(0, 40);
  if (!tag) return { tag, tracks: [], collections: [] };
  const match = { OR: [{ tags: { has: tag } }, { genre: tag }] };
  const [tracks, collections] = await Promise.all([
    db.track.findMany({
      where: { AND: [publicTrackWhere(now), match] },
      orderBy: sort === "popular" ? [{ playCount: "desc" }, { likeCount: "desc" }, { id: "asc" }] : [{ publishedAt: "desc" }, { id: "asc" }],
      take: 48,
      select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) },
    }),
    db.collection.findMany({
      where: { AND: [publicCollectionWhere(), match] },
      orderBy: sort === "popular" ? [{ playCount: "desc" }, { likeCount: "desc" }, { id: "asc" }] : [{ publishedAt: "desc" }, { id: "asc" }],
      take: 12,
      select: collectionDtoSelect,
    }),
  ]);
  return { tag, tracks: tracks.map((t) => toTrackDto(t, { viewerId })), collections: collections.map((c) => toCollectionDto(c)) };
}
