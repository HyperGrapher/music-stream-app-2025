import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TrackPage, trackMetadata } from "../TrackPage";

type Params = Promise<{ username: string; trackSlug: string; secret: string }>;

const SECRET_PREFIX = "s-";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username, trackSlug, secret } = await params;
  if (!secret.startsWith(SECRET_PREFIX)) return { title: "Not found" };
  return trackMetadata({ username, slug: trackSlug, secret: secret.slice(SECRET_PREFIX.length) });
}

/** `/{username}/{trackSlug}/s-{token}`: a private track opened through its secret link. */
export default async function Page({ params }: { params: Params }) {
  const { username, trackSlug, secret } = await params;
  if (!secret.startsWith(SECRET_PREFIX)) notFound();
  return <TrackPage username={username} slug={trackSlug} secret={secret.slice(SECRET_PREFIX.length)} />;
}
