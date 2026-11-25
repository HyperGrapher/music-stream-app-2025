import { z } from "zod";

import { now } from "@/server/clock";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  collectionDtoSelect,
  RELEASE_TYPES,
  toCollectionDto,
} from "@/server/modules/collections/dto";
import { resolveUsername } from "@/server/modules/profiles/resolve";
import { imageUrls, likedByMeSelect, toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

const usernameInput = z.object({ username: z.string().min(1).max(60) });

export const profilesRouter = createTRPCRouter({
  /** Profile header data for `/{username}`; answers `redirect` for old usernames. */
  byUsername: publicProcedure.input(usernameInput).query(async ({ input, ctx }) => {
    const resolved = await resolveUsername(ctx.db, input.username);
    if (resolved.status === "missing") return { status: "missing" as const };
    if (resolved.status === "redirect") {
      return { status: "redirect" as const, to: `/${resolved.user.username}` };
    }
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: resolved.user.id },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bio: true,
        city: true,
        countryCode: true,
        verified: true,
        plan: true,
        followerCount: true,
        followingCount: true,
        publicTrackCount: true,
        createdAt: true,
        avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        bannerAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
      },
    });
    const { avatarAsset, bannerAsset, ...profile } = user;
    return {
      status: "ok" as const,
      profile: {
        ...profile,
        image: userAvatarUrl(user),
        bannerUrl: imageUrls(bannerAsset).artworkUrl,
        bannerSrcSet: imageUrls(bannerAsset).artworkSrcSet,
        isOwner: ctx.session?.user.id === user.id,
      },
    };
  }),

  /** Public tracks of a creator: newest first, or by plays. */
  tracks: publicProcedure
    .input(
      usernameInput.extend({
        sort: z.enum(["latest", "popular"]).default("latest"),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input, ctx }) => {
      const resolved = await resolveUsername(ctx.db, input.username);
      if (resolved.status === "missing") return [];
      const viewerId = ctx.session?.user.id ?? null;
      const rows = await ctx.db.track.findMany({
        where: { AND: [publicTrackWhere(now()), { creatorId: resolved.user.id }] },
        orderBy:
          input.sort === "popular"
            ? [{ playCount: "desc" }, { likeCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }]
            : [{ publishedAt: "desc" }, { id: "asc" }],
        take: input.limit,
        select: { ...trackDtoSelect, ...likedByMeSelect(viewerId) },
      });
      return rows.map((row) => toTrackDto(row, { viewerId }));
    }),

  /** Public collections of a creator: `albums` (release types) or `sets` (playlists). */
  collections: publicProcedure
    .input(usernameInput.extend({ kind: z.enum(["albums", "sets"]), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const resolved = await resolveUsername(ctx.db, input.username);
      if (resolved.status === "missing") return [];
      const rows = await ctx.db.collection.findMany({
        where: {
          AND: [
            publicCollectionWhere(),
            { ownerId: resolved.user.id },
            input.kind === "albums"
              ? { type: { in: [...RELEASE_TYPES] } }
              : { type: "PLAYLIST" as const },
          ],
        },
        orderBy:
          input.kind === "albums"
            ? [{ releaseDate: "desc" }, { publishedAt: "desc" }, { id: "asc" }]
            : [{ publishedAt: "desc" }, { id: "asc" }],
        take: input.limit,
        select: collectionDtoSelect,
      });
      return rows.map((row) => toCollectionDto(row));
    }),
});
