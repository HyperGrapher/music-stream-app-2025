import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TrackEditor } from "@/components/editor/TrackEditor";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session-user";
import { api } from "@/trpc/server";

export const metadata: Metadata = { title: "Edit track | Music Stream", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const { id } = await params;
  const { return: returnTo } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/studio/tracks/${id}/edit`)}`);
  const track = await api.tracks.forEdit({ id }).catch(() => null);
  if (!track) notFound();
  return <TrackEditor initial={track} returnTo={safeNextPath(returnTo, `/${track.username}/${track.slug}`)} />;
}
