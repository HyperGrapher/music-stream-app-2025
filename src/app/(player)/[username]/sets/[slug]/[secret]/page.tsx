import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionPage, collectionMetadata } from "../CollectionPage";

type Params = Promise<{ username: string; slug: string; secret: string }>;

const SECRET_PREFIX = "s-";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, slug, secret } = await params;
  if (!secret.startsWith(SECRET_PREFIX)) return { title: "Not found" };
  return collectionMetadata({ username, slug, secret: secret.slice(SECRET_PREFIX.length) });
}

/** `/{username}/sets/{slug}/s-{token}`: a private collection opened through its secret link. */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Promise<{ new?: string; at?: string }> }) {
  const { username, slug, secret } = await params;
  const { new: status, at } = await searchParams;
  if (!secret.startsWith(SECRET_PREFIX)) notFound();
  return <CollectionPage username={username} slug={slug} secret={secret.slice(SECRET_PREFIX.length)} justSaved={{ status, at }} />;
}
