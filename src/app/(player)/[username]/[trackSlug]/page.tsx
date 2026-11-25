import type { Metadata } from "next";

import { TrackPage, trackMetadata } from "./TrackPage";

type Params = Promise<{ username: string; trackSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, trackSlug } = await params;
  return trackMetadata({ username, slug: trackSlug });
}

/** `/{username}/{trackSlug}`: the canonical track permalink. */
export default async function Page({ params }: { params: Params }) {
  const { username, trackSlug } = await params;
  return <TrackPage username={username} slug={trackSlug} />;
}
