import { TRPCError } from "@trpc/server";

import type { Plan, Prisma, PrismaClient, ReportStatus, ReportTarget } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { recountPublicTracks } from "@/server/modules/publishing/fields";
import { removeCommentAsModerator } from "@/server/modules/tracks/comments";

type Target = { targetType: Exclude<ReportTarget, "MESSAGE">; targetId: string };
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Not found" });

/** AD-4: every admin action leaves an audit row. */
async function audit(db: Pick<PrismaClient, "moderationAction">, adminId: string, action: string, target: Target, reason?: string | null) {
  await db.moderationAction.create({ data: { adminId, action, targetType: target.targetType, targetId: target.targetId, reason: reason ?? null } });
}

/** AD-1: the dashboard numbers. */
export async function dashboard(db: PrismaClient, now = clockNow()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [openReports, newUsers, uploads, plays] = await Promise.all([
    db.report.count({ where: { status: "OPEN" } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.track.count({ where: { createdAt: { gte: since } } }),
    db.playEvent.count({ where: { createdAt: { gte: since }, counted: true } }),
  ]);
  return { openReports, newUsers, uploads, plays };
}

/**
 * AD-2: reports grouped per target, most distinct reporters first, then oldest. `status` filters on the reports, not the
 * target, so a resolved target with a later open report shows up under Open.
 */
export async function listReports(db: PrismaClient, { status = "OPEN", targetType, offset = 0, limit = 30 }: { status?: ReportStatus; targetType?: ReportTarget; offset?: number; limit?: number }) {
  const rows = await db.report.findMany({
    where: { status, ...(targetType ? { targetType } : {}) },
    orderBy: { createdAt: "asc" },
    take: 1000,
    select: { id: true, reporterId: true, targetType: true, targetId: true, reason: true, createdAt: true },
  });
  const groups = new Map<string, { targetType: ReportTarget; targetId: string; reporters: Set<string>; reasons: Set<string>; oldest: Date; count: number }>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    const g = groups.get(key) ?? { targetType: r.targetType, targetId: r.targetId, reporters: new Set(), reasons: new Set(), oldest: r.createdAt, count: 0 };
    g.reporters.add(r.reporterId);
    g.reasons.add(r.reason);
    g.count++;
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.reporters.size - a.reporters.size || a.oldest.getTime() - b.oldest.getTime());
  const page = sorted.slice(offset, offset + limit);
  const previews = await Promise.all(page.map((g) => previewTarget(db, g)));
  return {
    total: sorted.length,
    nextOffset: offset + limit < sorted.length ? offset + limit : null,
    items: page.map((g, i) => ({ targetType: g.targetType, targetId: g.targetId, reporters: g.reporters.size, reports: g.count, reasons: [...g.reasons], oldest: g.oldest, preview: previews[i] })),
  };
}

/** A short description of what was reported, for lists and the detail drawer. */
export async function previewTarget(db: PrismaClient, { targetType, targetId }: { targetType: ReportTarget; targetId: string }) {
  if (targetType === "TRACK") {
    const t = await db.track.findUnique({ where: { id: targetId }, select: { id: true, title: true, slug: true, moderationState: true, moderationReason: true, visibility: true, creator: { select: { id: true, username: true, name: true } } } });
    return t ? { kind: "TRACK" as const, title: t.title, href: `/${t.creator.username}/${t.slug}`, owner: t.creator, removed: t.moderationState === "REMOVED", reason: t.moderationReason, text: null as string | null } : null;
  }
  if (targetType === "COLLECTION") {
    const c = await db.collection.findUnique({ where: { id: targetId }, select: { title: true, slug: true, moderationState: true, moderationReason: true, owner: { select: { id: true, username: true, name: true } } } });
    return c ? { kind: "COLLECTION" as const, title: c.title, href: `/${c.owner.username}/sets/${c.slug}`, owner: c.owner, removed: c.moderationState === "REMOVED", reason: c.moderationReason, text: null as string | null } : null;
  }
  if (targetType === "COMMENT") {
    const c = await db.comment.findUnique({ where: { id: targetId }, select: { content: true, timestampSeconds: true, author: { select: { id: true, username: true, name: true } }, track: { select: { title: true, slug: true, creator: { select: { username: true } } } } } });
    return c ? { kind: "COMMENT" as const, title: `Comment on “${c.track.title}”`, href: `/${c.track.creator.username}/${c.track.slug}`, owner: c.author, removed: false, reason: null as string | null, text: c.content } : { kind: "COMMENT" as const, title: "Comment (already removed)", href: null, owner: null, removed: true, reason: null as string | null, text: null as string | null };
  }
  const u = await db.user.findUnique({ where: { id: targetId }, select: { id: true, username: true, name: true, status: true, bio: true } });
  return u ? { kind: "USER" as const, title: u.name, href: `/${u.username}`, owner: { id: u.id, username: u.username, name: u.name }, removed: u.status === "SUSPENDED", reason: null as string | null, text: u.bio } : null;
}

/** AD-2 detail: the preview, every report on the target, earlier moderation of it and of its owner. */
export async function reportDetail(db: PrismaClient, target: Target) {
  const preview = await previewTarget(db, target);
  const [reports, actions, ownerHistory] = await Promise.all([
    db.report.findMany({ where: { targetType: target.targetType, targetId: target.targetId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, reason: true, details: true, extra: true, status: true, resolution: true, createdAt: true, reporter: { select: { id: true, username: true, name: true } } } }),
    db.moderationAction.findMany({ where: { targetType: target.targetType, targetId: target.targetId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, action: true, reason: true, createdAt: true, admin: { select: { username: true, name: true } } } }),
    preview?.owner ? db.moderationAction.count({ where: { targetType: "USER", targetId: preview.owner.id, action: { in: ["SUSPEND_USER", "REMOVE_CONTENT"] } } }) : Promise.resolve(0),
  ]);
  return { target, preview, reports, actions, ownerHistory };
}

async function resolveReports(db: PrismaClient, adminId: string, target: Target, status: Exclude<ReportStatus, "OPEN">, resolution: string, message: string, now: Date) {
  const open = await db.report.findMany({ where: { targetType: target.targetType, targetId: target.targetId, status: "OPEN" }, select: { id: true, reporterId: true } });
  await db.report.updateMany({ where: { id: { in: open.map((r) => r.id) } }, data: { status, resolution, resolvedById: adminId } });
  // TS-3: reporters hear the outcome as a SYSTEM notification.
  for (const reporterId of new Set(open.map((r) => r.reporterId))) {
    await db.notification.create({ data: { recipientId: reporterId, actorId: null, type: "SYSTEM", message, groupKey: `SYSTEM:report:${target.targetId}:${now.toISOString()}`, createdAt: now } });
  }
  return open.length;
}

const TOOK_ACTION = "Thanks. We reviewed your report and took action.";
const NO_VIOLATION = "Thanks. We reviewed your report and found no violation.";

/** Dismiss: no violation. All open reports on the target close and their reporters are told. */
export async function dismissReports(db: PrismaClient, adminId: string, target: Target, note?: string, now = clockNow()) {
  const closed = await resolveReports(db, adminId, target, "DISMISSED", note ?? "No violation", NO_VIOLATION, now);
  await audit(db, adminId, "DISMISS", target, note);
  return { closed };
}

/**
 * Remove content: tracks and collections get `moderationState = REMOVED` with a reason (kept, restorable, hidden);
 * comments are deleted for real (AD-5); a reported user is suspended instead. The owner is notified and open reports resolve.
 */
export async function removeContent(db: PrismaClient, adminId: string, target: Target, reason: string, now = clockNow()) {
  if (!reason.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required" });
  if (target.targetType === "USER") return suspendUser(db, adminId, target.targetId, reason, now);
  let ownerId: string | null = null;
  let label = "";
  if (target.targetType === "TRACK") {
    const t = await db.track.update({ where: { id: target.targetId }, data: { moderationState: "REMOVED", moderationReason: reason.trim() }, select: { creatorId: true, title: true } }).catch(() => null);
    if (!t) throw notFound();
    ownerId = t.creatorId;
    label = `your track “${t.title}”`;
    await db.$transaction((tx) => recountPublicTracks(tx, t.creatorId, now));
    await db.spotlightItem.deleteMany({ where: { trackId: target.targetId } });
  } else if (target.targetType === "COLLECTION") {
    const c = await db.collection.update({ where: { id: target.targetId }, data: { moderationState: "REMOVED", moderationReason: reason.trim() }, select: { ownerId: true, title: true } }).catch(() => null);
    if (!c) throw notFound();
    ownerId = c.ownerId;
    label = `your collection “${c.title}”`;
    await db.spotlightItem.deleteMany({ where: { collectionId: target.targetId } });
  } else {
    const comment = await db.comment.findUnique({ where: { id: target.targetId }, select: { authorId: true } });
    if (!comment) throw notFound();
    ownerId = comment.authorId;
    label = "one of your comments";
    await removeCommentAsModerator(db, target.targetId);
  }
  await audit(db, adminId, "REMOVE_CONTENT", target, reason);
  const closed = await resolveReports(db, adminId, target, "RESOLVED", reason, TOOK_ACTION, now);
  if (ownerId) await db.notification.create({ data: { recipientId: ownerId, actorId: null, type: "SYSTEM", message: `We removed ${label}. Reason: ${reason.trim()}`, groupKey: `SYSTEM:removed:${target.targetId}`, createdAt: now } });
  return { closed };
}

/** Restore removed tracks or collections (AD-2). */
export async function restoreContent(db: PrismaClient, adminId: string, target: Target, note?: string, now = clockNow()) {
  if (target.targetType === "TRACK") {
    const t = await db.track.update({ where: { id: target.targetId }, data: { moderationState: "VISIBLE", moderationReason: null }, select: { creatorId: true } }).catch(() => null);
    if (!t) throw notFound();
    await db.$transaction((tx) => recountPublicTracks(tx, t.creatorId, now));
  } else if (target.targetType === "COLLECTION") {
    await db.collection.update({ where: { id: target.targetId }, data: { moderationState: "VISIBLE", moderationReason: null } }).catch(() => { throw notFound(); });
  } else if (target.targetType === "USER") {
    return unsuspendUser(db, adminId, target.targetId, note, now);
  } else throw new TRPCError({ code: "BAD_REQUEST", message: "Removed comments cannot be restored" });
  await audit(db, adminId, "RESTORE_CONTENT", target, note);
  return { ok: true };
}

async function requireNotAdmin(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!user) throw notFound();
  if (user.role === "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot be suspended here" });
  return user;
}

/** Suspend: status SUSPENDED (all their content disappears through the visibility rules), sessions end, open reports resolve. */
export async function suspendUser(db: PrismaClient, adminId: string, userId: string, reason: string, now = clockNow()) {
  if (!reason.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required" });
  await requireNotAdmin(db, userId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    await tx.session.deleteMany({ where: { userId } });
  });
  const target: Target = { targetType: "USER", targetId: userId };
  await audit(db, adminId, "SUSPEND_USER", target, reason);
  return { closed: await resolveReports(db, adminId, target, "RESOLVED", reason, TOOK_ACTION, now) };
}

export async function unsuspendUser(db: PrismaClient, adminId: string, userId: string, note?: string, now = clockNow()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (user?.status !== "SUSPENDED") throw new TRPCError({ code: "BAD_REQUEST", message: "That account is not suspended" });
  await db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  await db.$transaction((tx) => recountPublicTracks(tx, userId, now));
  await audit(db, adminId, "UNSUSPEND_USER", { targetType: "USER", targetId: userId }, note);
  return { ok: true };
}

/** AD-3: users by name, username or email. */
export async function searchUsers(db: PrismaClient, { q, offset = 0, limit = 30 }: { q?: string; offset?: number; limit?: number }) {
  const where: Prisma.UserWhereInput = q?.trim() ? { OR: [{ username: { contains: q.trim().toLowerCase() } }, { name: { contains: q.trim(), mode: "insensitive" } }, { email: { contains: q.trim().toLowerCase() } }] } : {};
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: offset, take: limit, select: { id: true, name: true, username: true, email: true, status: true, role: true, plan: true, verified: true, createdAt: true } }),
    db.user.count({ where }),
  ]);
  return { total, nextOffset: offset + limit < total ? offset + limit : null, items: rows };
}

export async function userDetail(db: PrismaClient, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true, email: true, status: true, role: true, plan: true, verified: true, createdAt: true, followerCount: true } });
  if (!user) throw notFound();
  const [tracks, collections, comments, reportsAgainst, reportsBy, actions] = await Promise.all([
    db.track.count({ where: { creatorId: userId } }),
    db.collection.count({ where: { ownerId: userId } }),
    db.comment.count({ where: { authorId: userId } }),
    db.report.count({ where: { OR: [{ targetType: "USER", targetId: userId }] } }),
    db.report.count({ where: { reporterId: userId } }),
    db.moderationAction.findMany({ where: { targetType: "USER", targetId: userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, action: true, reason: true, createdAt: true, admin: { select: { username: true } } } }),
  ]);
  return { user, counts: { tracks, collections, comments, reportsAgainst, reportsBy }, actions };
}

export async function setVerifiedBadge(db: PrismaClient, adminId: string, userId: string, verified: boolean) {
  await db.user.update({ where: { id: userId }, data: { verified } }).catch(() => { throw notFound(); });
  await audit(db, adminId, verified ? "VERIFY_USER" : "UNVERIFY_USER", { targetType: "USER", targetId: userId });
  return { ok: true };
}

export async function adminSetPlan(db: PrismaClient, adminId: string, userId: string, plan: Plan) {
  await db.user.update({ where: { id: userId }, data: { plan, planChangedAt: clockNow() } }).catch(() => { throw notFound(); });
  await audit(db, adminId, `SET_PLAN_${plan}`, { targetType: "USER", targetId: userId });
  return { ok: true };
}

