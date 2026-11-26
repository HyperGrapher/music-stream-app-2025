import type { Metadata } from "next";

import { TrackPage, trackMetadata } from "./TrackPage";

type Params = Promise<{ username: string; trackSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, trackSlug } = await params;
  return trackMetadata({ username, slug: trackSlug });
}

/** `/{username}/{trackSlug}`: the canonical track permalink. */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Promise<{ new?: string; at?: string }> }) {
  const { username, trackSlug } = await params;
  const { new: status, at } = await searchParams;
  return <TrackPage username={username} slug={trackSlug} justSaved={{ status, at }} />;
}
