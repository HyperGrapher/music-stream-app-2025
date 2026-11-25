import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeUsername } from "@/lib/names";

type Db = Pick<PrismaClient, "user" | "usernameRedirect">;

export type ResolvedUser =
  | { status: "found"; user: { id: string; username: string } }
  /** The URL used an old username: send the visitor to the current one. */
  | { status: "redirect"; user: { id: string; username: string } }
  | { status: "missing" };

/**
 * `/{username}` -> user. Case-insensitive (usernames are stored lowercase); old usernames resolve
 * through `UsernameRedirect` (IA-4); suspended and deleted accounts do not exist publicly (PR-5).
 */
export async function resolveUsername(db: Db, param: string): Promise<ResolvedUser> {
  const username = normalizeUsername(decodeURIComponent(param));
  const current = await db.user.findUnique({
    where: { username },
    select: { id: true, username: true, status: true },
  });
  if (current) {
    return current.status === "ACTIVE" ? { status: "found", user: current } : { status: "missing" };
  }
  const old = await db.usernameRedirect.findUnique({
    where: { oldUsername: username },
    select: { user: { select: { id: true, username: true, status: true } } },
  });
  return old && old.user.status === "ACTIVE" ? { status: "redirect", user: old.user } : { status: "missing" };
}

/** Same lookup for a track or collection slug under one owner, following `SlugRedirect`. */
export async function resolveSlug(
  db: Pick<PrismaClient, "slugRedirect">,
  ownerId: string,
  kind: "TRACK" | "COLLECTION",
  slug: string,
): Promise<string | null> {
  const redirect = await db.slugRedirect.findUnique({
    where: { ownerId_kind_oldSlug: { ownerId, kind, oldSlug: slug } },
    select: { targetId: true },
  });
  return redirect?.targetId ?? null;
}
