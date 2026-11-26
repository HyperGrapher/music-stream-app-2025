import { z } from "zod";

import { now } from "@/server/clock";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  collectionDtoSelect,
  RELEASE_TYPES,
  toCollectionDto,
} from "@/server/modules/collections/dto";
import { activityPage, collectionPage, followPage, likesPage, spotlight, trackPage } from "@/server/modules/profiles/lists";
import { resolveUsername } from "@/server/modules/profiles/resolve";
import { whoToFollow } from "@/server/modules/accounts/suggestions";
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
        profileLinks: { orderBy: { position: "asc" }, select: { id: true, url: true, title: true } },
      },
    });
    const banner = imageUrls(user.bannerAsset);
    return {
      status: "ok" as const,
      profile: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        city: user.city,
        countryCode: user.countryCode,
        verified: user.verified,
        plan: user.plan,
        followerCount: user.followerCount,
        followingCount: user.followingCount,
        publicTrackCount: user.publicTrackCount,
        createdAt: user.createdAt,
        links: user.profileLinks,
        image: userAvatarUrl(user),
        bannerUrl: banner.artworkUrl,
        bannerSrcSet: banner.artworkSrcSet,
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

  /** Is the viewer following this user (profile Follow button)? */
  relationship: publicProcedure.input(usernameInput).query(async ({ input, ctx }) => {
    const resolved = await resolveUsername(ctx.db, input.username);
    const viewerId = ctx.session?.user.id;
    if (resolved.status !== "found" || !viewerId) return { following: false, blocked: false };
    const [follow, block] = await Promise.all([
      ctx.db.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: resolved.user.id } }, select: { followerId: true } }),
      ctx.db.block.findFirst({ where: { OR: [{ blockerId: viewerId, blockedId: resolved.user.id }, { blockerId: resolved.user.id, blockedId: viewerId }] }, select: { blockerId: true } }),
    ]);
    return { following: follow !== null, blocked: block !== null };
  }),

  /** One page of a profile tab (PRD PR-1, PR-3): cursor pagination, 20 per page. */
  tabPage: publicProcedure
    .input(
      usernameInput.extend({
        tab: z.enum(["all", "popular-tracks", "tracks", "albums", "sets", "reposts", "likes"]),
        cursor: z.string().max(12).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const resolved = await resolveUsername(ctx.db, input.username);
      if (resolved.status !== "found") return { items: [], nextCursor: null as string | null, kind: "empty" as const };
      const c = { db: ctx.db, viewerId: ctx.session?.user.id ?? null };
      const id = resolved.user.id;
      switch (input.tab) {
        case "all":
        case "reposts":
          return { kind: "activity" as const, ...(await activityPage(c, id, input.tab === "all" ? "all" : "reposts", input.cursor)) };
        case "popular-tracks":
        case "tracks":
          return { kind: "tracks" as const, ...(await trackPage(c, id, input.tab === "tracks" ? "latest" : "popular", input.cursor)) };
        case "albums":
        case "sets":
          return { kind: "collections" as const, ...(await collectionPage(c, id, input.tab, input.cursor)) };
        case "likes": {
          const owner = await ctx.db.user.findUniqueOrThrow({ where: { id }, select: { showLikes: true } });
          // LK-4: hidden likes are visible only to their owner.
          if (!owner.showLikes && c.viewerId !== id) return { items: [], nextCursor: null as string | null, kind: "empty" as const };
          return { kind: "likes" as const, ...(await likesPage(c, id, input.cursor)) };
        }
      }
    }),

  spotlight: publicProcedure.input(usernameInput).query(async ({ input, ctx }) => {
    const resolved = await resolveUsername(ctx.db, input.username);
    if (resolved.status !== "found") return [];
    const owner = await ctx.db.user.findUniqueOrThrow({ where: { id: resolved.user.id }, select: { plan: true } });
    return spotlight({ db: ctx.db, viewerId: ctx.session?.user.id ?? null }, resolved.user.id, owner.plan);
  }),

  /** Followers / following lists (FO-3), optionally filtered by name. */
  follows: publicProcedure
    .input(usernameInput.extend({ direction: z.enum(["followers", "following"]), cursor: z.string().max(12).optional(), q: z.string().max(50).optional() }))
    .query(async ({ input, ctx }) => {
      const resolved = await resolveUsername(ctx.db, input.username);
      if (resolved.status !== "found") return { items: [], nextCursor: null as string | null };
      return followPage({ db: ctx.db, viewerId: ctx.session?.user.id ?? null }, resolved.user.id, input.direction, input.cursor, input.q);
    }),

  /** "Who to follow" module (FO-4); signed-out visitors get popular creators. */
  suggestions: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(24).default(5), exclude: z.array(z.string()).max(50).default([]) }))
    .query(({ input, ctx }) => whoToFollow(ctx.db, ctx.session?.user.id ?? null, input)),
});
