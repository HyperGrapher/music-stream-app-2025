import { z } from "zod";

import { onlineNow, overview } from "@/server/modules/analytics";
import { addReservedNames, listReservedNames, MAX_LIST_CHARS, removeReservedName, setReservedBlocked } from "@/server/modules/reserved";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { adminSetPlan, dashboard, dismissReports, listReports, removeContent, reportDetail, restoreContent, searchUsers, setVerifiedBadge, suspendUser, unsuspendUser, userDetail } from "@/server/modules/trust/admin";

const target = z.object({ targetType: z.enum(["TRACK", "COLLECTION", "COMMENT", "USER", "MESSAGE"]), targetId: z.string().min(1).max(64) });
const reason = z.string().trim().min(1, "A reason is required").max(500);

/** AD-1..AD-4. Every procedure is admin-only and unknown (NOT_FOUND) to everyone else. */
export const adminRouter = createTRPCRouter({
  dashboard: adminProcedure.query(({ ctx }) => dashboard(ctx.db)),

  reports: adminProcedure
    .input(z.object({ status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"), targetType: z.enum(["TRACK", "COLLECTION", "COMMENT", "USER", "MESSAGE"]).optional(), offset: z.number().int().min(0).default(0) }))
    .query(({ input, ctx }) => listReports(ctx.db, input)),

  reportDetail: adminProcedure.input(target).query(({ input, ctx }) => reportDetail(ctx.db, input)),

  dismiss: adminProcedure.input(target.extend({ note: z.string().max(500).optional() })).mutation(({ input, ctx }) => dismissReports(ctx.db, ctx.adminId, input, input.note)),
  remove: adminProcedure.input(target.extend({ reason })).mutation(({ input, ctx }) => removeContent(ctx.db, ctx.adminId, input, input.reason)),
  restore: adminProcedure.input(target.extend({ note: z.string().max(500).optional() })).mutation(({ input, ctx }) => restoreContent(ctx.db, ctx.adminId, input, input.note)),

  suspend: adminProcedure.input(z.object({ userId: z.string().min(1), reason })).mutation(({ input, ctx }) => suspendUser(ctx.db, ctx.adminId, input.userId, input.reason)),
  unsuspend: adminProcedure.input(z.object({ userId: z.string().min(1), note: z.string().max(500).optional() })).mutation(({ input, ctx }) => unsuspendUser(ctx.db, ctx.adminId, input.userId, input.note)),

  users: adminProcedure.input(z.object({ q: z.string().max(100).optional(), offset: z.number().int().min(0).default(0) })).query(({ input, ctx }) => searchUsers(ctx.db, input)),
  user: adminProcedure.input(z.object({ userId: z.string().min(1) })).query(({ input, ctx }) => userDetail(ctx.db, input.userId)),
  setVerified: adminProcedure.input(z.object({ userId: z.string().min(1), verified: z.boolean() })).mutation(({ input, ctx }) => setVerifiedBadge(ctx.db, ctx.adminId, input.userId, input.verified)),
  setPlan: adminProcedure.input(z.object({ userId: z.string().min(1), plan: z.enum(["FREE", "PRO"]) })).mutation(({ input, ctx }) => adminSetPlan(ctx.db, ctx.adminId, input.userId, input.plan)),

  /** Admin-added reserved usernames (the built-in list is code and read-only). */
  reservedNames: adminProcedure.query(({ ctx }) => listReservedNames(ctx.db)),
  addReservedNames: adminProcedure
    .input(z.object({ text: z.string().max(MAX_LIST_CHARS), note: z.string().max(100).optional() }))
    .mutation(({ input, ctx }) => addReservedNames(ctx.db, ctx.adminId, input.text, input.note)),
  setReservedBlocked: adminProcedure
    .input(z.object({ name: z.string().min(1).max(60), blocked: z.boolean() }))
    .mutation(({ input, ctx }) => setReservedBlocked(ctx.db, input.name, input.blocked)),
  removeReservedName: adminProcedure
    .input(z.object({ name: z.string().min(1).max(60) }))
    .mutation(({ input, ctx }) => removeReservedName(ctx.db, input.name)),

  /** Visitors seen in the last two minutes (registered and guests). */
  onlineNow: adminProcedure.query(({ ctx }) => onlineNow(ctx.db)),
  /** Visitor analytics for the last 1, 7, 30 or 90 days. */
  analytics: adminProcedure.input(z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(7) })).query(({ ctx, input }) => overview(ctx.db, { days: input.days })),
});
