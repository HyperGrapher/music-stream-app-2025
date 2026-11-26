import { TRPCError } from "@trpc/server";

import type { PrismaClient } from "@/generated/prisma/client";
import { MAX_COLLECTION_TRACKS } from "@/lib/collection-fields";
import { firstFree, slugBase } from "@/lib/names";
import { now as clockNow } from "@/server/clock";
import { addTracksToCollection } from "@/server/modules/collections/edit";
import { withSlugRetry } from "@/server/modules/publishing";
import { newSecretToken } from "@/server/modules/tokens";

/** The caller's playlists for the "Add to playlist" dialog; `hasTrack` tells which already contain `trackId` (PL-P6). */
export async function myPlaylists(db: PrismaClient, userId: string, trackId?: string) {
  const rows = await db.collection.findMany({
    where: { ownerId: userId, type: "PLAYLIST" },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      visibility: true,
      trackCount: true,
      ...(trackId ? { tracks: { where: { trackId }, select: { trackId: true }, take: 1 } } : {}),
    },
  });
  return rows.map(({ tracks, ...row }) => ({ ...row, hasTrack: (tracks?.length ?? 0) > 0 }));
}

/** Creates a playlist (private unless asked), optionally with a first batch of tracks. */
export async function createPlaylist(
  db: PrismaClient,
  userId: string,
  input: { title: string; privacy?: "public" | "private"; trackIds?: string[] },
) {
  const title = input.title.trim();
  if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the playlist a title" });
  if ((input.trackIds?.length ?? 0) > MAX_COLLECTION_TRACKS) throw new TRPCError({ code: "BAD_REQUEST", message: "A playlist holds at most 500 tracks" });
  const at = clockNow();
  const isPublic = input.privacy === "public";

  const collection = await withSlugRetry(() =>
    db.$transaction(async (tx) => {
      const slug = await firstFree(
        slugBase(title, "playlist"),
        async (candidate) => (await tx.collection.findUnique({ where: { ownerId_slug: { ownerId: userId, slug: candidate } }, select: { id: true } })) !== null,
        80,
      );
      return tx.collection.create({
        data: {
          ownerId: userId,
          slug,
          type: "PLAYLIST",
          title,
          visibility: isPublic ? "PUBLIC" : "PRIVATE",
          secretToken: newSecretToken(),
          publishedAt: isPublic ? at : null,
        },
        select: { id: true, title: true, slug: true, visibility: true },
      });
    }),
  );
  const added = input.trackIds?.length ? (await addTracksToCollection(db, userId, collection.id, input.trackIds)).added : 0;
  return { ...collection, added };
}
