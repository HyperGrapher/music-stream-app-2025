import { TRPCError } from "@trpc/server";

import type { Prisma, PrismaClient, ReportReason, ReportTarget } from "@/generated/prisma/client";
import { now as clockNow } from "@/server/clock";
import { enforceRateLimit, RATE_LIMITS } from "@/server/modules/rate-limit";
import { collectionAccess, collectionAccessSelect, trackAccess, trackAccessSelect } from "@/server/modules/visibility";

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "COPYRIGHT", label: "Copyright infringement" },
  { value: "SPAM", label: "Spam or scam" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hate speech" },
  { value: "SEXUAL", label: "Sexual content" },
  { value: "VIOLENCE", label: "Violence or dangerous content" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Other" },
];
export const REPORT_DETAILS_MAX = 1000;

export interface ReportInput {
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details?: string | null;
  /** Copyright only: the reporter says they hold the rights, plus a link to the original work. */
  rightsHolder?: boolean;
  originalUrl?: string | null;
  now?: Date;
}

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "That content could not be found" });

/** Who owns the reported thing (reporting your own content is pointless), and proof the reporter can see it. */
async function ownerOf(db: PrismaClient, type: ReportInput["targetType"], id: string, reporterId: string, now: Date): Promise<string> {
  if (type === "TRACK") {
    const row = await db.track.findUnique({ where: { id }, select: { ...trackAccessSelect } });
    if (!row || !trackAccess(row, { viewerId: reporterId, now })) throw notFound();
    return row.creatorId;
  }
  if (type === "COLLECTION") {
    const row = await db.collection.findUnique({ where: { id }, select: { ...collectionAccessSelect } });
    if (!row || !collectionAccess(row, { viewerId: reporterId })) throw notFound();
    return row.ownerId;
  }
  if (type === "COMMENT") {
    const row = await db.comment.findUnique({ where: { id }, select: { authorId: true, track: { select: { ...trackAccessSelect } } } });
    if (!row || !trackAccess(row.track, { viewerId: reporterId, now })) throw notFound();
    return row.authorId;
  }
  if (type === "MESSAGE") {
    // MS-6: only someone in the conversation can report one of its messages.
    const row = await db.message.findUnique({ where: { id }, select: { senderId: true, removedAt: true, conversation: { select: { members: { select: { userId: true } } } } } });
    if (!row || row.removedAt || !row.conversation.members.some((m) => m.userId === reporterId)) throw notFound();
    return row.senderId;
  }
  const user = await db.user.findUnique({ where: { id }, select: { id: true, status: true } });
  if (user?.status !== "ACTIVE") throw notFound();
  return user.id;
}

/**
 * TS-1/TS-2: reports a track, collection, comment, user or message. One open report per reporter per target (reporting again
 * updates it), at most 20 a day. You cannot report your own content or yourself.
 */
export async function createReport(db: PrismaClient, input: ReportInput) {
  const at = input.now ?? clockNow();
  const owner = await ownerOf(db, input.targetType, input.targetId, input.reporterId, at);
  if (owner === input.reporterId) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't report your own content" });
  const details = input.details?.trim().slice(0, REPORT_DETAILS_MAX) || null;
  if (input.reason === "COPYRIGHT" && !input.rightsHolder && !details) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "For copyright reports, confirm you are the rights holder or explain who is" });
  }
  const extra: Prisma.InputJsonValue | undefined = input.reason === "COPYRIGHT" ? { rightsHolder: !!input.rightsHolder, originalUrl: input.originalUrl?.trim().slice(0, 300) || null } : undefined;

  // Re-reporting updates the open report and does not count against the daily limit.
  const open = await db.report.findFirst({ where: { reporterId: input.reporterId, targetType: input.targetType, targetId: input.targetId, status: "OPEN" }, select: { id: true } });
  if (open) {
    await db.report.update({ where: { id: open.id }, data: { reason: input.reason, details, ...(extra ? { extra } : {}) } });
    return { id: open.id, updated: true };
  }
  await enforceRateLimit(db, "report", input.reporterId, RATE_LIMITS.reportPerDay);
  const report = await db.report.create({ data: { reporterId: input.reporterId, targetType: input.targetType, targetId: input.targetId, reason: input.reason, details, ...(extra ? { extra } : {}), createdAt: at }, select: { id: true } });
  return { id: report.id, updated: false };
}
