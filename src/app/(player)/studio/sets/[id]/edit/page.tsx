import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CollectionEditor } from "@/components/editor/CollectionEditor";
import { safeNextPath } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/session-user";
import { api } from "@/trpc/server";

export const metadata: Metadata = { title: "Edit | Music Stream", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ return?: string }> }) {
  const { id } = await params;
  const { return: returnTo } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/studio/sets/${id}/edit`)}`);
  const collection = await api.collections.forEdit({ id }).catch(() => null);
  if (!collection) notFound();
  return <CollectionEditor initial={collection} returnTo={safeNextPath(returnTo, `/${collection.username}/sets/${collection.slug}`)} />;
}
