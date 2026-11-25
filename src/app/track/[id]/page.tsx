import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { now } from "@/server/clock";
import { db } from "@/server/db";
import { isTrackId } from "@/server/modules/tracks/access";
import { accessibleTrackWhere } from "@/server/modules/visibility";

/** Legacy `/track/{id}` URL: 308 to the canonical permalink (PRD 4.1). Hidden tracks answer 404. */
export default async function LegacyTrackRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTrackId(id)) notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  const track = await db.track.findFirst({
    where: { AND: [{ id }, accessibleTrackWhere(session?.user.id, now())] },
    select: { slug: true, creator: { select: { username: true } } },
  });
  if (!track) notFound();
  permanentRedirect(`/${track.creator.username}/${track.slug}`);
}
