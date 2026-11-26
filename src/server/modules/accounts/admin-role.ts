import type { PrismaClient } from "@/generated/prisma/client";

/** Emails listed in `ADMIN_EMAILS` (comma-separated, case-insensitive). The only way to become an admin: the UI cannot promote. */
export function adminEmailSet(raw: string | undefined = process.env.ADMIN_EMAILS) {
  return new Set(raw?.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) ?? []);
}
export const isAdminEmail = (email: string, raw?: string) => adminEmailSet(raw).has(email.toLowerCase());

/**
 * Makes `ADMIN_EMAILS` authoritative without needing a fresh sign-in: an account whose email is listed and **verified**
 * (Google verifies it; email sign-ups must open their link first, so nobody can claim an admin address by registering it)
 * becomes ADMIN. Returns the resulting role. Cheap: one read, one write only when something changes.
 */
export async function ensureAdminRole(db: Pick<PrismaClient, "user">, userId: string): Promise<"USER" | "ADMIN"> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, role: true } });
  if (!user) return "USER";
  if (user.role !== "ADMIN" && user.emailVerified && isAdminEmail(user.email)) {
    await db.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    return "ADMIN";
  }
  return user.role;
}
