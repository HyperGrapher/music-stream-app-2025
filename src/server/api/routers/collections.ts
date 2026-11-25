import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { now } from "@/server/clock";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
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
});
