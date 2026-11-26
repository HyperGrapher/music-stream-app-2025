import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { now } from "@/server/clock";
import { TRPCError } from "@trpc/server";

import { accountProcedure, createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { r2Client } from "@/lib/r2";
import { collectionFieldsSchema } from "@/lib/collection-fields";
import { runAfter } from "@/server/after";
import { addTracksToCollection, deleteCollection, removeTrackFromCollection, reorderCollection, resetCollectionSecret, updateCollection } from "@/server/modules/collections/edit";
import { slugAvailability } from "@/server/modules/publishing/edit";
import { drainStorageDeletions } from "@/server/modules/storage/deletion";
import { imageUrls } from "@/server/modules/tracks/dto";
import {
  collectionDtoSelect,
  collectionPermalink,
  toCollectionDto,
} from "@/server/modules/collections/dto";
import { resolveSlug, resolveUsername } from "@/server/modules/profiles/resolve";
import { likedByMeSelect, toTrackDto, trackDtoSelect } from "@/server/modules/tracks/dto";
import {
  collectionAccess,
  collectionAccessSelect,
  trackAccess,
  trackAccessSelect,
} from "@/server/modules/visibility";

export const collectionsRouter = createTRPCRouter({
  /** Resolves `/{username}/sets/{slug}` (optionally via the collection's secret link) for the collection page. */
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
        ...collectionAccessSelect,
        ...collectionDtoSelect,
        secretToken: true,
        moderationState: true,
        tracks: {
          orderBy: { position: "asc" as const },
          select: {
            position: true,
            track: {
              select: {
                ...trackAccessSelect,
                ...trackDtoSelect,
                ...likedByMeSelect(viewerId),
              },
            },
          },
        },
      } satisfies Prisma.CollectionSelect;

      let collection = await ctx.db.collection.findUnique({
        where: { ownerId_slug: { ownerId: owner.user.id, slug } },
        select,
      });
      let redirected = owner.status === "redirect";
      if (!collection) {
        const targetId = await resolveSlug(ctx.db, owner.user.id, "COLLECTION", slug);
        if (targetId) {
          collection = await ctx.db.collection.findUnique({ where: { id: targetId }, select });
          redirected = true;
        }
      }
      if (!collection) return { status: "missing" as const };

      const access = collectionAccess(collection, { viewerId, secret: input.secret });
      if (!access) return { status: "missing" as const };

      const secret = access === "secret" ? input.secret : null;
      if (redirected) return { status: "redirect" as const, to: collectionPermalink(collection, secret) };

      const via = access === "secret" ? { row: collection, secret: input.secret } : null;
      const tracks = collection.tracks.map(({ position, track }) => {
        const trackGrant = trackAccess(track, { viewerId, now: at, viaCollection: via });
        // VI-3: tracks the viewer cannot play keep their place but show no details.
        if (!trackGrant) return { position, available: false as const, id: track.id };
        return {
          position,
          available: true as const,
          ...toTrackDto(track, {
            viewerId,
            access: trackGrant === "secret" && via ? { secret: input.secret, collectionId: collection.id } : undefined,
          }),
        };
      });

      return {
        status: "ok" as const,
        collection: {
          ...toCollectionDto(collection, { secret }),
          isOwner: access === "owner",
          viaSecret: access === "secret",
          secretToken: access === "owner" ? collection.secretToken : null,
          tracks,
        },
      };
    }),

  forEdit: accountProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    const c = await ctx.db.collection.findFirst({
      where: { id: input.id, ownerId: ctx.account.id },
      include: {
        artworkAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        owner: { select: { username: true } },
        tracks: { orderBy: { position: "asc" }, select: { position: true, track: { select: { ...trackAccessSelect, ...trackDtoSelect } } } },
      },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
    return {
      id: c.id, slug: c.slug, username: c.owner.username, type: c.type, title: c.title, description: c.description, genre: c.genre,
      tags: c.tags, visibility: c.visibility, releaseDate: c.releaseDate, recordLabel: c.recordLabel, publisher: c.publisher,
      license: c.license, secretToken: c.secretToken, artworkAssetId: c.artworkAssetId,
      artworkUrl: imageUrls(c.artworkAsset).artworkUrl, trackCount: c.trackCount, durationMs: c.durationMs,
      tracks: c.tracks.map((e) => ({ position: e.position, ...toTrackDto(e.track, { viewerId: ctx.account.id }), ownTrack: e.track.creatorId === ctx.account.id, visibilityRaw: e.track.visibility })),
    };
  }),

  update: accountProcedure
    .input(collectionFieldsSchema.partial().extend({ id: z.string().uuid(), applyToTracks: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...fields } = input;
      const c = await updateCollection(ctx.db, ctx.account.id, id, fields as never);
      runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 20 }));
      return { id: c.id, slug: c.slug, permalink: `/${ctx.session.user.username!}/sets/${c.slug}` };
    }),

  checkSlug: accountProcedure
    .input(z.object({ slug: z.string().max(100), selfId: z.string().uuid().optional() }))
    .query(({ input, ctx }) => slugAvailability(ctx.db, ctx.account.id, "COLLECTION", input.slug, input.selfId)),

  resetSecret: accountProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input, ctx }) => resetCollectionSecret(ctx.db, ctx.account.id, input.id)),

  addTracks: accountProcedure
    .input(z.object({ id: z.string().uuid(), trackIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(({ input, ctx }) => addTracksToCollection(ctx.db, ctx.account.id, input.id, input.trackIds)),

  removeTrack: accountProcedure
    .input(z.object({ id: z.string().uuid(), trackId: z.string().uuid() }))
    .mutation(({ input, ctx }) => removeTrackFromCollection(ctx.db, ctx.account.id, input.id, input.trackId)),

  reorder: accountProcedure
    .input(z.object({ id: z.string().uuid(), trackIds: z.array(z.string().uuid()).max(500) }))
    .mutation(({ input, ctx }) => reorderCollection(ctx.db, ctx.account.id, input.id, input.trackIds)),

  delete: accountProcedure
    .input(z.object({ id: z.string().uuid(), deleteTracks: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const result = await deleteCollection(ctx.db, ctx.account.id, input.id, input.deleteTracks);
      runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 50 }));
      return result;
    }),
});
