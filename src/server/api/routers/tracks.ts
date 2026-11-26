import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { now } from "@/server/clock";
import { accountProcedure, createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { r2Client } from "@/lib/r2";
import { runAfter } from "@/server/after";
import { drainStorageDeletions } from "@/server/modules/storage/deletion";
import { trackFieldsSchema } from "@/lib/track-fields";
import { deleteTrack, replaceTrackAudio, resetTrackSecret, slugAvailability, trackDeleteImpact, updateTrack } from "@/server/modules/publishing/edit";
import { RELEASE_TYPES, collectionPermalink } from "@/server/modules/collections/dto";
import { resolveSlug, resolveUsername } from "@/server/modules/profiles/resolve";
import { relatedTracks } from "@/server/modules/tracks/related";
import { authorizeTrack } from "@/server/modules/tracks/authorize";
import {
  creatorSelect,
  imageUrls,
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
      const followsCreator =
        viewerId && viewerId !== track.creatorId
          ? (await ctx.db.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: track.creatorId } }, select: { followerId: true } })) !== null
          : false;
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
            followedByMe: followsCreator,
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

  /** Everything the editor needs about one of your own tracks. */
  forEdit: accountProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const track = await ctx.db.track.findFirst({
      where: { id: input.id, creatorId: ctx.account.id },
      include: {
        artworkAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        creator: { select: { username: true } },
        collectionEntries: { select: { collection: { select: { id: true, title: true, slug: true, type: true, visibility: true } } } },
      },
    });
    if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
    const art = imageUrls(track.artworkAsset, `/api/tracks/${track.id}/artwork`);
    return {
      id: track.id, slug: track.slug, username: track.creator.username, title: track.title, artistName: track.artistName,
      featuredArtists: track.featuredArtists, description: track.description, genre: track.genre, tags: track.tags,
      visibility: track.visibility, publishAt: track.publishAt, publishedAt: track.publishedAt, releaseDate: track.releaseDate,
      recordLabel: track.recordLabel, publisher: track.publisher, isrc: track.isrc, bpm: track.bpm, musicalKey: track.musicalKey,
      explicit: track.explicit, buyUrl: track.buyUrl, buyTitle: track.buyTitle, license: track.license, downloadable: track.downloadable,
      commentsEnabled: track.commentsEnabled, statsPublic: track.statsPublic, embeddable: track.embeddable, previewStartMs: track.previewStartMs,
      durationMs: track.durationMs, secretToken: track.secretToken, moderationState: track.moderationState,
      artworkUrl: art.artworkUrl, artworkAssetId: track.artworkAssetId, waveformUrl: `/api/tracks/${track.id}/waveform`,
      collections: track.collectionEntries.map((e) => e.collection), plan: ctx.account.plan,
    };
  }),

  update: accountProcedure
    .input(trackFieldsSchema.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...fields } = input;
      const track = await updateTrack(ctx.db, ctx.account, id, fields as never);
      runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 20 }));
      return { id: track.id, slug: track.slug, permalink: `/${ctx.session.user.username!}/${track.slug}` };
    }),

  checkSlug: accountProcedure
    .input(z.object({ slug: z.string().max(100), selfId: z.string().uuid().optional() }))
    .query(({ input, ctx }) => slugAvailability(ctx.db, ctx.account.id, "TRACK", input.slug, input.selfId)),

  resetSecret: accountProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input, ctx }) => resetTrackSecret(ctx.db, ctx.account.id, input.id)),

  deleteImpact: accountProcedure.input(z.object({ id: z.string().uuid() })).query(({ input, ctx }) => trackDeleteImpact(ctx.db, ctx.account.id, input.id)),

  delete: accountProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const result = await deleteTrack(ctx.db, ctx.account.id, input.id);
    runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 20 }));
    return result;
  }),

  replaceAudio: accountProcedure
    .input(z.object({ id: z.string().uuid(), mediaAssetId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const result = await replaceTrackAudio(ctx.db, ctx.account, input.id, input.mediaAssetId);
      runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 20 }));
      return result;
    }),

  /** Related public tracks for the track page sidebar and autoplay (TR-8, PL-P5). */
  related: publicProcedure
    .input(z.object({ trackId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(({ input, ctx }) => relatedTracks(ctx.db, { trackId: input.trackId, viewerId: ctx.session?.user.id ?? null, limit: input.limit })),

  /** Your own tracks (any visibility) for "add your tracks" pickers (ED-7). */
  mine: accountProcedure
    .input(z.object({ q: z.string().trim().max(100).optional(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db.track.findMany({
        where: { creatorId: ctx.account.id, ...(input.q ? { title: { contains: input.q, mode: "insensitive" } } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: input.limit,
        select: { ...trackDtoSelect },
      });
      return rows.map((row) => toTrackDto(row, { viewerId: ctx.account.id }));
    }),
});
