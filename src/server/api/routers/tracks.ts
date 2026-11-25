import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { now } from "@/server/clock";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { RELEASE_TYPES, collectionPermalink } from "@/server/modules/collections/dto";
import { resolveSlug, resolveUsername } from "@/server/modules/profiles/resolve";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import {
  creatorSelect,
  likedByMeSelect,
  toTrackDto,
  trackDtoSelect,
  userAvatarUrl,
  trackPermalink,
} from "@/server/modules/tracks/dto";
import {
  effectiveVisibility,
  publicCollectionWhere,
  trackAccessSelect,
} from "@/server/modules/visibility";

export const tracksRouter = createTRPCRouter({
  /**
   * Resolves `/{username}/{slug}` (optionally with a secret link token) for the track page.
   * Old usernames and slugs answer with a redirect (IA-4); hidden tracks answer `missing`.
   */
  byPermalink: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).max(60),
        slug: z.string().min(1).max(120),
        secret: z.string().min(10).max(64).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const at = now();
      const viewerId = ctx.session?.user.id ?? null;
      const owner = await resolveUsername(ctx.db, input.username);
      if (owner.status === "missing") return { status: "missing" as const };

      const slug = decodeURIComponent(input.slug).toLowerCase();
      const select = {
        ...trackAccessSelect,
        ...trackDtoSelect,
        ...likedByMeSelect(viewerId),
        description: true,
        releaseDate: true,
        publishAt: true,
        moderationState: true,
        moderationReason: true,
        secretToken: true,
        isrc: true,
        recordLabel: true,
        publisher: true,
        buyUrl: true,
        buyTitle: true,
        license: true,
        bpm: true,
        musicalKey: true,
        featuredArtists: true,
        downloadable: true,
        commentsEnabled: true,
        embeddable: true,
        downloadCount: true,
        collectionEntries: {
          where: { collection: publicCollectionWhere() },
          orderBy: [{ collection: { likeCount: "desc" as const } }],
          take: 3,
          select: {
            position: true,
            collection: {
              select: {
                id: true,
                slug: true,
                title: true,
                type: true,
                owner: { select: { username: true } },
              },
            },
          },
        },
      } satisfies Prisma.TrackSelect;

      let track = await ctx.db.track.findUnique({
        where: { creatorId_slug: { creatorId: owner.user.id, slug } },
        select,
      });
      let redirected = owner.status === "redirect";
      if (!track) {
        const targetId = await resolveSlug(ctx.db, owner.user.id, "TRACK", slug);
        if (targetId) {
          track = await ctx.db.track.findUnique({ where: { id: targetId }, select });
          redirected = true;
        }
      }
      if (!track) return { status: "missing" as const };

      const access = await authorizeTrack(ctx.db, track, { viewerId, secret: input.secret }, at);
      if (!access) return { status: "missing" as const };

      const permalinkSecret = access === "secret" ? input.secret : null;
      if (redirected) {
        return { status: "redirect" as const, to: trackPermalink(track, permalinkSecret) };
      }

      const isOwner = access === "owner";
      const dto = toTrackDto(track, {
        viewerId,
        access: access === "secret" ? { secret: input.secret } : undefined,
        secretForPermalink: permalinkSecret,
      });
      const creator = await ctx.db.user.findUniqueOrThrow({
        where: { id: track.creatorId },
        select: {
          ...creatorSelect.select,
          bio: true,
          city: true,
          countryCode: true,
          followerCount: true,
          publicTrackCount: true,
        },
      });

      return {
        status: "ok" as const,
        track: {
          ...dto,
          description: track.description,
          releaseDate: track.releaseDate,
          isrc: track.isrc,
          recordLabel: track.recordLabel,
          publisher: track.publisher,
          buyUrl: track.buyUrl,
          buyTitle: track.buyTitle,
          license: track.license,
          bpm: track.bpm,
          musicalKey: track.musicalKey,
          featuredArtists: track.featuredArtists,
          downloadable: track.downloadable,
          commentsEnabled: track.commentsEnabled,
          embeddable: track.embeddable,
          statsPublic: track.statsPublic,
          visibility: track.visibility,
          publishAt: track.publishAt,
          effectiveVisibility: effectiveVisibility(track, at),
          moderationState: track.moderationState,
          moderationReason: isOwner ? track.moderationReason : null,
          /** Owner only: the secret link token (the page builds `/{username}/{slug}/s-{token}`). */
          secretToken: isOwner ? track.secretToken : null,
          isOwner,
          viaSecret: access === "secret",
          creator: {
            id: creator.id,
            name: creator.name,
            username: creator.username,
            image: userAvatarUrl(creator),
            verified: creator.verified,
            plan: creator.plan,
            bio: creator.bio,
            city: creator.city,
            countryCode: creator.countryCode,
            followersCount: creator.followerCount,
            trackCount: creator.publicTrackCount,
          },
          collections: track.collectionEntries.map((entry) => ({
            id: entry.collection.id,
            title: entry.collection.title,
            type: entry.collection.type,
            isRelease: (RELEASE_TYPES as readonly string[]).includes(entry.collection.type),
            position: entry.position,
            permalink: collectionPermalink(entry.collection),
          })),
        },
      };
    }),
});
