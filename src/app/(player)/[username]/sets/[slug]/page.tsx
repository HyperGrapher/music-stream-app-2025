import type { Metadata } from "next";

import { CollectionPage, collectionMetadata } from "./CollectionPage";

type Params = Promise<{ username: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, slug } = await params;
  return collectionMetadata({ username, slug });
}

/** `/{username}/sets/{slug}`: any collection type. */
export default async function Page({ params }: { params: Params }) {
  const { username, slug } = await params;
  return <CollectionPage username={username} slug={slug} />;
}
