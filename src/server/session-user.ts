import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { userAvatarUrl } from "@/server/modules/tracks/dto";

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  /** The uploaded avatar's rendition, else the OAuth image. */
  image: string | null;
  emailVerified: boolean;
  onboardedAt: Date | null;
  role: "USER" | "ADMIN";
}

/**
 * The signed-in user as the app shell needs it, read from the database (not the cookie cache, which can
 * lag by minutes after an avatar, username or verification change). One lookup per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true, name: true, username: true, email: true, image: true, emailVerified: true, onboardedAt: true, role: true, status: true,
      avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } },
    },
  });
  if (user?.status !== "ACTIVE") return null;
  return { ...user, image: userAvatarUrl(user) };
});
