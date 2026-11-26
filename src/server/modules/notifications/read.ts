import type { NotificationType, Prisma, PrismaClient } from "@/generated/prisma/client";
import { collectionPermalink } from "@/server/modules/collections/dto";
import { trackPermalink, userAvatarUrl } from "@/server/modules/tracks/dto";

/** Filter tabs of the notifications page (NT-5). */
export const NOTIFICATION_FILTERS = {
  all: null,
  likes: ["TRACK_LIKE", "COLLECTION_LIKE", "COMMENT_LIKE"],
  reposts: ["TRACK_REPOST", "COLLECTION_REPOST"],
  comments: ["COMMENT", "REPLY"],
  follows: ["FOLLOW"],
  mentions: ["MENTION"],
} as const satisfies Record<string, readonly NotificationType[] | null>;
export type NotificationFilter = keyof typeof NOTIFICATION_FILTERS;

const RAW_PAGE = 120;

const select = {
  id: true,
  type: true,
  groupKey: true,
  message: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true, username: true, image: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } } },
  track: { select: { id: true, title: true, slug: true, creator: { select: { username: true } } } },
  collection: { select: { id: true, title: true, slug: true, owner: { select: { username: true } } } },
  comment: { select: { content: true } },
} as const satisfies Prisma.NotificationSelect;

type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;

export interface NotificationItem {
  key: string;
  type: NotificationType;
  ids: string[];
  actors: { id: string; name: string; username: string; image: string | null }[];
  /** Distinct actors in the group (the list above shows the newest three). */
  actorCount: number;
  createdAt: Date;
  /** Unread when any member is unread (NT-3). */
  unread: boolean;
  message: string | null;
  excerpt: string | null;
  target: { title: string; href: string } | null;
}

function targetOf(row: Row) {
  if (row.track) return { title: row.track.title, href: trackPermalink({ slug: row.track.slug, creator: row.track.creator }) };
  if (row.collection) return { title: row.collection.title, href: collectionPermalink({ slug: row.collection.slug, owner: row.collection.owner }) };
  return null;
}

/** Aggregation at read time by `groupKey` (NT-3): "Ana, Bo and 12 others liked Blue Hour". Newest group first. */
export function groupNotifications(rows: Row[]): NotificationItem[] {
  const groups = new Map<string, NotificationItem>();
  for (const row of rows) {
    // Notifications without an actor (SYSTEM) never merge.
    const key = row.actor ? row.groupKey : `${row.groupKey}:${row.id}`;
    let item = groups.get(key);
    if (!item) {
      item = { key, type: row.type, ids: [], actors: [], actorCount: 0, createdAt: row.createdAt, unread: false, message: row.message, excerpt: row.comment?.content.slice(0, 120) ?? null, target: targetOf(row) };
      groups.set(key, item);
    }
    item.ids.push(row.id);
    if (!row.readAt) item.unread = true;
    if (row.actor && !item.actors.some((a) => a.id === row.actor!.id)) {
      item.actorCount += 1;
      if (item.actors.length < 3) item.actors.push({ id: row.actor.id, name: row.actor.name, username: row.actor.username, image: userAvatarUrl(row.actor) });
    }
  }
  return [...groups.values()];
}

export async function listNotifications(
  db: PrismaClient,
  userId: string,
  { filter = "all", before, limit = 20 }: { filter?: NotificationFilter; before?: Date; limit?: number } = {},
) {
  const types = NOTIFICATION_FILTERS[filter];
  const rows = await db.notification.findMany({
    where: { recipientId: userId, ...(types ? { type: { in: [...types] } } : {}), ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: RAW_PAGE,
    select,
  });
  const items = groupNotifications(rows).slice(0, limit);
  // A group is complete only up to the last raw row we loaded; continue after the oldest row of the page.
  const lastKept = items.at(-1);
  const hasMore = rows.length === RAW_PAGE || groupNotifications(rows).length > limit;
  const oldest = lastKept ? rows.filter((r) => items.some((i) => i.ids.includes(r.id))).at(-1)?.createdAt : undefined;
  return { items, nextBefore: hasMore ? (oldest ?? null) : null };
}

export async function unreadCount(db: PrismaClient, userId: string) {
  const rows = await db.notification.findMany({ where: { recipientId: userId, readAt: null }, select: { groupKey: true, actorId: true, id: true }, take: 500 });
  // Grouped like the list: a group counts once.
  return new Set(rows.map((r) => (r.actorId ? r.groupKey : r.id))).size;
}

export async function markRead(db: PrismaClient, userId: string, ids?: string[]) {
  const result = await db.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { marked: result.count };
}
