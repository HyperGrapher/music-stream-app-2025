import type { MetadataRoute } from "next";

import { env } from "@/env";
import { now } from "@/server/clock";
import { db } from "@/server/db";
import { publicCollectionWhere, publicTrackWhere } from "@/server/modules/visibility";

export const revalidate = 3600;

/** Public tracks, collections and creators only (never hidden, scheduled-in-the-future or removed content). Capped for the 50 000-URL limit. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL ?? env.BETTER_AUTH_URL;
  const at = now();
  const [tracks, collections, users] = await Promise.all([
    db.track.findMany({ where: publicTrackWhere(at), orderBy: { publishedAt: "desc" }, take: 20_000, select: { slug: true, updatedAt: true, creator: { select: { username: true } } } }),
    db.collection.findMany({ where: publicCollectionWhere(), orderBy: { publishedAt: "desc" }, take: 10_000, select: { slug: true, updatedAt: true, owner: { select: { username: true } } } }),
    db.user.findMany({ where: { status: "ACTIVE", onboardedAt: { not: null }, publicTrackCount: { gt: 0 } }, orderBy: { followerCount: "desc" }, take: 10_000, select: { username: true, updatedAt: true } }),
  ]);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/charts`, changeFrequency: "daily", priority: 0.7 },
    ...users.map((u) => ({ url: `${base}/${u.username}`, lastModified: u.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...tracks.map((t) => ({ url: `${base}/${t.creator.username}/${t.slug}`, lastModified: t.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...collections.map((c) => ({ url: `${base}/${c.owner.username}/sets/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
