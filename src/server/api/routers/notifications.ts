import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { listNotifications, markRead, NOTIFICATION_FILTERS, unreadCount } from "@/server/modules/notifications/read";

export const notificationsRouter = createTRPCRouter({
  /** One page of grouped notifications; `before` is the `nextBefore` of the previous page. */
  list: protectedProcedure
    .input(z.object({ filter: z.enum(Object.keys(NOTIFICATION_FILTERS) as [keyof typeof NOTIFICATION_FILTERS, ...(keyof typeof NOTIFICATION_FILTERS)[]]).default("all"), before: z.date().optional(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(({ input, ctx }) => listNotifications(ctx.db, ctx.session.user.id, input)),

  unreadCount: protectedProcedure.query(({ ctx }) => unreadCount(ctx.db, ctx.session.user.id)),

  /** Marks the given notifications read, or every one when `ids` is omitted. */
  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(200).optional() }))
    .mutation(({ input, ctx }) => markRead(ctx.db, ctx.session.user.id, input.ids)),
});
