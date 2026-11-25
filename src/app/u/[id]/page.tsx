import { notFound, permanentRedirect } from "next/navigation";

import { db } from "@/server/db";

/** Legacy `/u/{id}` URL: 308 to `/{username}` (accepts a user id or a username). */
export default async function LegacyProfileRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await db.user.findFirst({
    where: { OR: [{ id }, { username: id.toLowerCase() }], status: "ACTIVE" },
    select: { username: true },
  });
  if (!user) notFound();
  permanentRedirect(`/${user.username}`);
}
