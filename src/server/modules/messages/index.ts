import { TRPCError } from "@trpc/server";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { MAX_CARDS_PER_MESSAGE, MESSAGE_MAX, extractUrls, pairKey, parseContentUrl, type ContentRef } from "@/lib/message-links";
import { normalizeUsername } from "@/lib/names";
import { now as clockNow } from "@/server/clock";
import { appError } from "@/server/errors";
import { collectionDtoSelect, toCollectionDto } from "@/server/modules/collections/dto";
import { resolveUsername } from "@/server/modules/profiles/resolve";
import { enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { imageAssetSelect, likedByMeSelect, toTrackDto, trackDtoSelect, userAvatarUrl } from "@/server/modules/tracks/dto";
import { collectionAccess, trackAccess } from "@/server/modules/visibility";

/** Direct messages (PRD 13.3): 1:1 conversations, plain text, polled (no realtime on serverless). */

const DAY_MS = 86_400_000;
const YOUNG_ACCOUNT_MS = 7 * DAY_MS;
const LIST_LIMIT = 100;
const THREAD_PAGE = 50;

const personSelect = { id: true, name: true, username: true, image: true, verified: true, status: true, avatarAsset: imageAssetSelect } as const;
type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;
const toPerson = (u: PersonRow) => ({ id: u.id, name: u.name, username: u.username, verified: u.verified, image: userAvatarUrl(u) });
export type MessagePerson = ReturnType<typeof toPerson>;

const notFound = (what = "Conversation") => new TRPCError({ code: "NOT_FOUND", message: `${what} not found` });

export type CannotMessage = "SELF" | "UNAVAILABLE" | "BLOCKED" | "POLICY";

const REFUSAL_TEXT: Record<CannotMessage, string> = {
  SELF: "You can't message yourself",
  UNAVAILABLE: "That person can't be messaged",
  BLOCKED: "You can't message this person",
  POLICY: "This person doesn't accept messages from you",
};

/**
 * MS-3: may `senderId` write to `recipientId`? Blocks (either way) always refuse. The recipient's "Who can message me"
 * setting decides the rest: Everyone, People I follow (the recipient follows the sender), or No one. Replying to someone
 * who messaged you first is always allowed, so a conversation can never be one-sided by accident.
 */
export async function messagingStatus(db: PrismaClient, senderId: string, recipientId: string): Promise<{ ok: true } | { ok: false; reason: CannotMessage }> {
  if (senderId === recipientId) return { ok: false, reason: "SELF" };
  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { status: true, messagePolicy: true } });
  if (recipient?.status !== "ACTIVE") return { ok: false, reason: "UNAVAILABLE" };
  const blocked = await db.block.findFirst({ where: { OR: [{ blockerId: senderId, blockedId: recipientId }, { blockerId: recipientId, blockedId: senderId }] }, select: { blockerId: true } });
  if (blocked) return { ok: false, reason: "BLOCKED" };
  if (recipient.messagePolicy === "EVERYONE") return { ok: true };
  if (recipient.messagePolicy === "FOLLOWING") {
    const follows = await db.follow.findUnique({ where: { followerId_followingId: { followerId: recipientId, followingId: senderId } }, select: { followerId: true } });
    if (follows) return { ok: true };
  }
  const theyWroteFirst = await db.message.findFirst({ where: { conversation: { pairKey: pairKey(senderId, recipientId) }, senderId: recipientId }, select: { id: true } });
  return theyWroteFirst ? { ok: true } : { ok: false, reason: "POLICY" };
}

function refusal(reason: CannotMessage) {
  if (reason === "UNAVAILABLE") return notFound("User");
  if (reason === "BLOCKED") return appError("FORBIDDEN", "BLOCKED", REFUSAL_TEXT.BLOCKED);
  return new TRPCError({ code: "FORBIDDEN", message: REFUSAL_TEXT[reason] });
}

/** MS-1: what the compose screen needs about a person: who they are, whether you may write, and an existing conversation. */
export async function recipientInfo(db: PrismaClient, viewerId: string, username: string) {
  const resolved = await resolveUsername(db, normalizeUsername(username));
  if (resolved.status === "missing") throw notFound("User");
  const user = await db.user.findUniqueOrThrow({ where: { id: resolved.user.id }, select: personSelect });
  const [status, existing] = await Promise.all([
    messagingStatus(db, viewerId, user.id),
    db.conversation.findUnique({ where: { pairKey: pairKey(viewerId, user.id) }, select: { id: true } }),
  ]);
  return { person: toPerson(user), canMessage: status.ok, reason: status.ok ? null : status.reason, conversationId: existing?.id ?? null };
}

/** Sends a message (MS-1..MS-4), creating the conversation on the first one. Returns the conversation id. */
export async function sendMessage(db: PrismaClient, senderId: string, input: { recipientId: string; body: string; now?: Date }) {
  const body = input.body.trim();
  if (!body) throw new TRPCError({ code: "BAD_REQUEST", message: "Write a message first" });
  if (body.length > MESSAGE_MAX) throw new TRPCError({ code: "BAD_REQUEST", message: `Messages are at most ${MESSAGE_MAX} characters` });
  const at = input.now ?? clockNow();

  const status = await messagingStatus(db, senderId, input.recipientId);
  if (!status.ok) throw refusal(status.reason);
  await enforceRateLimit(db, "message", senderId, RATE_LIMITS.messagePerMinute);

  const key = pairKey(senderId, input.recipientId);
  let conversation = await db.conversation.findUnique({ where: { pairKey: key }, select: { id: true } });
  if (!conversation) {
    const sender = await db.user.findUniqueOrThrow({ where: { id: senderId }, select: { createdAt: true } });
    if (at.getTime() - sender.createdAt.getTime() < YOUNG_ACCOUNT_MS) await enforceRateLimit(db, "new-conversation", senderId, RATE_LIMITS.newConversationPerDay);
    try {
      conversation = await db.conversation.create({
        data: { pairKey: key, createdAt: at, lastMessageAt: at, members: { create: [{ userId: senderId }, { userId: input.recipientId }] } },
        select: { id: true },
      });
    } catch (error) {
      // The other person (or another tab) created it a moment ago: use that one.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      conversation = await db.conversation.findUniqueOrThrow({ where: { pairKey: key }, select: { id: true } });
    }
  }
  const conversationId = conversation.id;
  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({ data: { conversationId, senderId, body, createdAt: at }, select: { id: true } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: at } });
    // Writing means you have read everything so far.
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: senderId } }, data: { lastReadAt: at } });
    return created;
  });
  return { conversationId, messageId: message.id };
}

/** Whether a member's hidden marker (MS-6) leaves a message visible: only newer ones show. */
const visibleAfter = (hiddenAt: Date | null) => (hiddenAt ? { createdAt: { gt: hiddenAt } } : {});

/** Unread messages from other people per conversation for this user (blocked senders and removed messages do not count). */
async function unreadByConversation(db: PrismaClient, userId: string) {
  const rows = await db.$queryRaw<{ conversationId: string; n: number }[]>`
    SELECT m."conversationId", count(*)::int AS n
    FROM "message" m
    JOIN "conversation_member" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}
    WHERE m."senderId" <> ${userId}
      AND m."removedAt" IS NULL
      AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
      AND (cm."hiddenAt" IS NULL OR m."createdAt" > cm."hiddenAt")
      AND NOT EXISTS (SELECT 1 FROM "block" b WHERE b."blockerId" = ${userId} AND b."blockedId" = m."senderId")
    GROUP BY m."conversationId"`;
  return new Map(rows.map((r) => [r.conversationId, r.n]));
}

/** MS-5: the badge number: conversations with something unread. */
export async function unreadConversationCount(db: PrismaClient, userId: string) {
  return (await unreadByConversation(db, userId)).size;
}

/** MS-2: the conversation list, newest activity first. Conversations with someone you blocked, and ones you deleted since, are left out. */
export async function listConversations(db: PrismaClient, userId: string) {
  const [members, unread, blockedByMe] = await Promise.all([
    db.conversationMember.findMany({
      where: { userId },
      orderBy: { conversation: { lastMessageAt: "desc" } },
      take: LIST_LIMIT * 2,
      select: {
        hiddenAt: true,
        conversation: {
          select: {
            id: true,
            lastMessageAt: true,
            members: { where: { userId: { not: userId } }, select: { user: { select: personSelect } } },
            messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, body: true, senderId: true, createdAt: true, removedAt: true } },
          },
        },
      },
    }),
    unreadByConversation(db, userId),
    db.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
  ]);
  const blocked = new Set(blockedByMe.map((b) => b.blockedId));
  return members
    .flatMap((m) => {
      const { conversation } = m;
      const other = conversation.members[0]?.user;
      const last = conversation.messages[0];
      if (!other || !last || blocked.has(other.id)) return [];
      if (m.hiddenAt && last.createdAt <= m.hiddenAt) return [];
      return [{
        id: conversation.id,
        other: toPerson(other),
        at: conversation.lastMessageAt,
        unread: unread.get(conversation.id) ?? 0,
        last: { mine: last.senderId === userId, body: last.removedAt ? "Message removed" : last.body.slice(0, 140), at: last.createdAt },
      }];
    })
    .slice(0, LIST_LIMIT);
}

function withoutAccessColumns<T extends { secretToken: string; moderationState: unknown }>(row: T): Omit<T, "secretToken" | "moderationState" | "publishAt"> {
  const copy: Record<string, unknown> = { ...row };
  delete copy.secretToken;
  delete copy.moderationState;
  delete copy.publishAt;
  return copy as Omit<T, "secretToken" | "moderationState" | "publishAt">;
}

type Card =
  | { kind: "track"; url: string; track: ReturnType<typeof toTrackDto> }
  | { kind: "set"; url: string; set: ReturnType<typeof toCollectionDto> };

/** MS-2: track and collection links in messages become mini cards, resolved for the viewer (hidden content needs its secret link). */
async function resolveCards(db: PrismaClient, viewerId: string, urls: Map<string, ContentRef>, now: Date): Promise<Map<string, Card>> {
  const cards = new Map<string, Card>();
  await Promise.all(
    [...urls].map(async ([url, ref]) => {
      const owner = await db.user.findUnique({ where: { username: ref.username }, select: { id: true, status: true } });
      if (owner?.status !== "ACTIVE") return;
      if (ref.kind === "track") {
        const row = await db.track.findFirst({ where: { creatorId: owner.id, slug: ref.slug }, select: { ...trackDtoSelect, secretToken: true, publishAt: true, moderationState: true, ...likedByMeSelect(viewerId) } });
        const access = row && trackAccess(row, { viewerId, secret: ref.secret, now });
        // The secret token was selected only to decide access: it must never reach a DTO (a public track keeps one).
        if (row && access) cards.set(url, { kind: "track", url, track: toTrackDto(withoutAccessColumns(row), { viewerId, access: { secret: ref.secret }, secretForPermalink: access === "secret" ? ref.secret : null }) });
        return;
      }
      const row = await db.collection.findFirst({ where: { ownerId: owner.id, slug: ref.slug }, select: { ...collectionDtoSelect, secretToken: true, moderationState: true } });
      const access = row && collectionAccess(row, { viewerId, secret: ref.secret });
      if (row && access) cards.set(url, { kind: "set", url, set: toCollectionDto(withoutAccessColumns(row), { secret: access === "secret" ? ref.secret : null }) });
    }),
  );
  return cards;
}

/** MS-2/MS-5: one page of a thread (oldest first), the other person, and whether you can still write. */
export async function getThread(db: PrismaClient, userId: string, input: { conversationId: string; before?: string; appHost: string; now?: Date }) {
  const now = input.now ?? clockNow();
  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: input.conversationId, userId } },
    select: { hiddenAt: true, lastReadAt: true, conversation: { select: { members: { where: { userId: { not: userId } }, select: { user: { select: personSelect } } } } } },
  });
  const other = member?.conversation.members[0]?.user;
  if (!member || !other) throw notFound();
  const blockedByMe = await db.block.findUnique({ where: { blockerId_blockedId: { blockerId: userId, blockedId: other.id } }, select: { blockerId: true } });
  if (blockedByMe) throw notFound();

  const rows = await db.message.findMany({
    where: { conversationId: input.conversationId, ...visibleAfter(member.hiddenAt) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: THREAD_PAGE + 1,
    ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
    select: { id: true, body: true, senderId: true, createdAt: true, removedAt: true },
  });
  const page = rows.slice(0, THREAD_PAGE).reverse();

  const refs = new Map<string, ContentRef>();
  for (const m of page) {
    if (m.removedAt) continue;
    for (const url of extractUrls(m.body).slice(0, MAX_CARDS_PER_MESSAGE)) {
      const ref = parseContentUrl(url, input.appHost);
      if (ref) refs.set(url, ref);
    }
  }
  const cards = refs.size ? await resolveCards(db, userId, refs, now) : new Map<string, Card>();
  const status = await messagingStatus(db, userId, other.id);

  return {
    other: toPerson(other),
    canSend: status.ok,
    cannotSendReason: status.ok ? null : status.reason,
    nextBefore: rows.length > THREAD_PAGE ? (rows[THREAD_PAGE - 1]?.id ?? null) : null,
    lastReadAt: member.lastReadAt,
    messages: page.map((m) => ({
      id: m.id,
      mine: m.senderId === userId,
      at: m.createdAt,
      removed: !!m.removedAt,
      body: m.removedAt ? "" : m.body,
      cards: m.removedAt ? [] : extractUrls(m.body).slice(0, MAX_CARDS_PER_MESSAGE).flatMap((url) => cards.get(url) ?? []),
    })),
  };
}

/** Marks the conversation read up to now. */
export async function markConversationRead(db: PrismaClient, userId: string, conversationId: string, now = clockNow()) {
  const result = await db.conversationMember.updateMany({ where: { conversationId, userId }, data: { lastReadAt: now } });
  if (result.count === 0) throw notFound();
}

/** MS-6: deleting hides the conversation and its history for you only; a new message from either side brings it back (without the old messages). */
export async function hideConversation(db: PrismaClient, userId: string, conversationId: string, now = clockNow()) {
  const result = await db.conversationMember.updateMany({ where: { conversationId, userId }, data: { hiddenAt: now, lastReadAt: now } });
  if (result.count === 0) throw notFound();
}

/** The other member of a conversation you belong to (for replying by conversation id). */
export async function otherMemberId(db: PrismaClient, userId: string, conversationId: string) {
  const member = await db.conversationMember.findFirst({ where: { conversationId, userId: { not: userId }, conversation: { members: { some: { userId } } } }, select: { userId: true } });
  if (!member) throw notFound();
  return member.userId;
}
