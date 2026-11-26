import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { auth } from "@/lib/auth";
import { db } from "@/server/db";
import { userAvatarUrl } from "@/server/modules/tracks/dto";

export const metadata: Metadata = { title: "Welcome | Music Stream", robots: { index: false } };

export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin?next=/onboarding");
  // The database, not the cached session, decides: the session cookie may lag a few minutes.
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { username: true, name: true, image: true, onboardedAt: true, avatarAsset: { select: { id: true, publicUrl: true, imageWidths: true } } },
  });
  if (user.onboardedAt) redirect("/");
  return <OnboardingForm initialUsername={user.username} initialName={user.name} initialImage={userAvatarUrl(user)} />;
}
