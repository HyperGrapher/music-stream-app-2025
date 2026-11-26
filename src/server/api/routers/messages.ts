import { z } from "zod";

import { MESSAGE_MAX } from "@/lib/message-links";
import { env } from "@/env";
import { accountProcedure, createTRPCRouter, protectedProcedure, verifiedProcedure } from "@/server/api/trpc";
import {
  getThread,
  hideConversation,
  listConversations,
  markConversationRead,
  otherMemberId,
  recipientInfo,
  sendMessage,
  unreadConversationCount,
} from "@/server/modules/messages";

const appHost = () => new URL(env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL).host;
const conversationId = z.string().uuid();

export const messagesRouter = createTRPCRouter({
  /** MS-5: how many conversations have something unread (the navbar badge, polled). */
  unreadCount: protectedProcedure.query(({ ctx }) => unreadConversationCount(ctx.db, ctx.session.user.id)),

  /** MS-2: the conversation list. */
  conversations: accountProcedure.query(({ ctx }) => listConversations(ctx.db, ctx.account.id)),

  /** One page of a thread, oldest first; `before` is the `nextBefore` of the page you hold. */
  thread: accountProcedure
    .input(z.object({ conversationId, before: z.string().uuid().optional() }))
    .query(({ ctx, input }) => getThread(ctx.db, ctx.account.id, { ...input, appHost: appHost() })),

  /** MS-1: who a "Message" button leads to, and whether you may write to them. */
  recipient: accountProcedure
    .input(z.object({ username: z.string().min(1).max(60) }))
    .query(({ ctx, input }) => recipientInfo(ctx.db, ctx.account.id, input.username)),

  /** Sends to a person (starting the conversation if needed) or into an existing conversation. Needs a verified email (AU-4). */
  send: verifiedProcedure
    .input(z.object({ body: z.string().max(MESSAGE_MAX * 2), toUserId: z.string().min(1).optional(), conversationId: conversationId.optional() }).refine((v) => !!v.toUserId !== !!v.conversationId, "Say who the message is for"))
    .mutation(async ({ ctx, input }) => {
      const recipientId = input.toUserId ?? (await otherMemberId(ctx.db, ctx.account.id, input.conversationId!));
      return sendMessage(ctx.db, ctx.account.id, { recipientId, body: input.body });
    }),

  markRead: accountProcedure.input(z.object({ conversationId })).mutation(({ ctx, input }) => markConversationRead(ctx.db, ctx.account.id, input.conversationId)),

  /** MS-6: delete for me. */
  hide: accountProcedure.input(z.object({ conversationId })).mutation(({ ctx, input }) => hideConversation(ctx.db, ctx.account.id, input.conversationId)),
});
