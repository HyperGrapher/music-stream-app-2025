import type { Metadata } from "next";
import Link from "next/link";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { api } from "@/trpc/server";

import { ProfileList } from "./ProfileList";
import { ProfileShell, profileMetadata } from "./ProfileShell";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return profileMetadata((await params).username);
}

/** `/{username}`: Spotlight first (SP-1), then the user's activity (PR-1). */
export default async function Page({ params }: { params: Params }) {
  const { username } = await params;
  const [initial, spotlight] = await Promise.all([
    api.profiles.tabPage({ username, tab: "all" }),
    api.profiles.spotlight({ username }),
  ]);
  const tracks = spotlight.flatMap((item) => (item.kind === "track" ? [item.track] : []));
  return (
    <ProfileShell username={username} active="all">
      {spotlight.length > 0 && (
        <section aria-labelledby="spotlight" className="mb-8">
          <h2 id="spotlight" className="border-b border-zinc-800 pb-2 text-xs font-bold tracking-wide uppercase">
            Spotlight
          </h2>
          {spotlight.map((item) =>
            item.kind === "track" ? (
              <WaveformTrackItem key={item.track.id} track={item.track} playlist={tracks} />
            ) : (
              <div key={item.collection.id} className="max-w-[200px] py-4">
                <CollectionCard collection={item.collection} />
              </div>
            ),
          )}
        </section>
      )}
      <ProfileList username={username} tab="all" initial={initial} empty="Nothing here yet." />
      <p className="mt-6 text-xs text-zinc-400">
        <Link href={`/${username}/tracks`} className="hover:text-zinc-400">
          See all tracks
        </Link>
      </p>
    </ProfileShell>
  );
}
