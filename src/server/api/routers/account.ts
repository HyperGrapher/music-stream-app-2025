import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { EMAIL_DEFAULT_ON } from "@/server/modules/notifications/email";

import { r2Client } from "@/lib/r2";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { runAfter } from "@/server/after";
import {
  changeUsername,
  checkUsername,
  completeOnboarding,
  setUserImage,
} from "@/server/modules/accounts";
import { markAccountDeleted, purgeAccountContent } from "@/server/modules/accounts/deletion";
import { whoToFollow } from "@/server/modules/accounts/suggestions";
import { imageUrls, userAvatarUrl } from "@/server/modules/tracks/dto";
import { drainStorageDeletions } from "@/server/modules/storage/deletion";
import { GENRES } from "@/lib/genres";

const genreSlug = z.enum(GENRES.map((g) => g.value) as [string, ...string[]]);
const imageId = z.string().uuid().nullable();
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .url("Enter a full web address starting with https://")
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"), "Links must start with https://");

const NOTIFICATION_TYPES = ["FOLLOW", "TRACK_LIKE", "COLLECTION_LIKE", "TRACK_REPOST", "COLLECTION_REPOST", "COMMENT", "REPLY", "MENTION", "COMMENT_LIKE", "PLAYLIST_ADD", "NEW_RELEASE", "SYSTEM"] as const;
const COUNTRY = z.string().length(2).regex(/^[A-Za-z]{2}$/);

export const accountRouter = createTRPCRouter({
  /** The signed-in user's own account data for settings and onboarding. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: {
        id: true, name: true, username: true, email: true, emailVerified: true, image: true, bio: true, city: true,
        countryCode: true, plan: true, role: true, onboardedAt: true, favoriteGenres: true, messagePolicy: true,
        showLikes: true, showInTopListeners: true, showWaveformComments: true, defaultLicense: true, emailFrequency: true,
        avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        bannerAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
        profileLinks: { orderBy: { position: "asc" }, select: { id: true, url: true, title: true } },
        accounts: { select: { providerId: true } },
      },
    });
    const { avatarAsset, bannerAsset, accounts, ...rest } = user;
    return {
      ...rest,
      avatarUrl: userAvatarUrl({ image: user.image, avatarAsset }),
      hasUploadedAvatar: avatarAsset !== null,
      bannerUrl: imageUrls(bannerAsset).artworkUrl,
      hasPassword: accounts.some((a) => a.providerId === "credential"),
      providers: accounts.map((a) => a.providerId),
    };
  }),

  /** Live username availability (shape, reserved words, uniqueness) with suggestions on conflict. */
  checkUsername: protectedProcedure
    .input(z.object({ username: z.string().max(40) }))
    .query(({ input, ctx }) => checkUsername(ctx.db, input.username, ctx.session.user.id)),

  /** The creators offered during onboarding (12, most followed in the chosen genres). */
  onboardingSuggestions: protectedProcedure
    .input(z.object({ genres: z.array(genreSlug).max(10) }))
    .query(({ input, ctx }) => whoToFollow(ctx.db, ctx.session.user.id, { genres: input.genres, limit: 12 })),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        username: z.string().max(40),
        name: z.string().trim().min(1).max(50),
        avatarAssetId: imageId.optional(),
        genres: z.array(genreSlug).min(3, "Pick at least 3 genres").max(10),
        follow: z.array(z.string().min(1)).max(50).default([]),
      }),
    )
    .mutation(({ input, ctx }) => completeOnboarding(ctx.db, ctx.session.user.id, input)),

  updateProfile: protectedProcedure
    .input(
      z.object({
        username: z.string().max(40).optional(),
        name: z.string().trim().min(1).max(50).optional(),
        bio: z.string().max(1000).nullable().optional(),
        city: z.string().trim().max(80).nullable().optional(),
        countryCode: COUNTRY.nullable().optional(),
        avatarAssetId: imageId.optional(),
        bannerAssetId: imageId.optional(),
        links: z.array(z.object({ url: httpsUrl, title: z.string().trim().max(60).nullable().optional() })).max(10).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const username = input.username ? await changeUsername(ctx.db, userId, input.username) : undefined;
      await ctx.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
            ...(input.city !== undefined ? { city: input.city || null } : {}),
            ...(input.countryCode !== undefined ? { countryCode: input.countryCode?.toUpperCase() ?? null } : {}),
          },
        });
        if (input.avatarAssetId !== undefined) await setUserImage(tx, userId, "avatar", input.avatarAssetId);
        if (input.bannerAssetId !== undefined) await setUserImage(tx, userId, "banner", input.bannerAssetId);
        if (input.links) {
          await tx.profileLink.deleteMany({ where: { userId } });
          await tx.profileLink.createMany({
            data: input.links.map((link, position) => ({ userId, url: link.url, title: link.title ?? null, position })),
          });
        }
      });
      runAfter(() => drainStorageDeletions(ctx.db, r2Client, { limit: 20 }));
      return { username: username ?? ctx.session.user.username };
    }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        showLikes: z.boolean().optional(),
        showInTopListeners: z.boolean().optional(),
        showWaveformComments: z.boolean().optional(),
        messagePolicy: z.enum(["EVERYONE", "FOLLOWING", "NOBODY"]).optional(),
        defaultLicense: z.enum(["ALL_RIGHTS_RESERVED", "CC0", "CC_BY", "CC_BY_SA", "CC_BY_ND", "CC_BY_NC", "CC_BY_NC_SA", "CC_BY_NC_ND"]).optional(),
        emailFrequency: z.enum(["OFF", "DAILY", "IMMEDIATE"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ctx.db.user.update({ where: { id: ctx.session.user.id }, data: input });
      return { ok: true };
    }),

  /**
   * AU-10: type your username to confirm. The account is hidden and signed out at once; its content
   * and R2 objects are removed right after (and by the daily cron if that is interrupted).
   */
  deleteAccount: protectedProcedure
    .input(z.object({ confirmUsername: z.string().max(40) }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
      if (input.confirmUsername.trim().toLowerCase() !== user.username) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type your username exactly to confirm" });
      }
      await markAccountDeleted(ctx.db, userId);
      runAfter(async () => {
        await purgeAccountContent(ctx.db, userId);
        await drainStorageDeletions(ctx.db, r2Client, { limit: 100 });
      });
      return { ok: true };
    }),

  /** Per-type notification preferences (NT-7), defaults filled in. */
  notificationPreferences: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.notificationPreference.findMany({ where: { userId: ctx.session.user.id } });
    const byType = new Map(rows.map((r) => [r.type, r]));
    return NOTIFICATION_TYPES.map((type) => ({ type, inApp: byType.get(type)?.inApp ?? type !== "NEW_RELEASE", email: byType.get(type)?.email ?? EMAIL_DEFAULT_ON.has(type) }));
  }),

  setNotificationPreference: protectedProcedure
    .input(z.object({ type: z.enum(NOTIFICATION_TYPES), inApp: z.boolean().optional(), email: z.boolean().optional() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      await ctx.db.notificationPreference.upsert({
        where: { userId_type: { userId, type: input.type } },
        create: { userId, type: input.type, inApp: input.inApp ?? input.type !== "NEW_RELEASE", email: input.email ?? EMAIL_DEFAULT_ON.has(input.type) },
        update: { ...(input.inApp !== undefined ? { inApp: input.inApp } : {}), ...(input.email !== undefined ? { email: input.email } : {}) },
      });
      return { ok: true };
    }),
});
