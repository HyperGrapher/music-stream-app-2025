import { Upload } from "lucide-react";
import Link from "next/link";

import { TrackGrid } from "@/app/_components/TrackGrid";
import { WhoToFollow } from "@/app/_components/WhoToFollow";
import { getSessionUser } from "@/server/session-user";
import { api } from "@/trpc/server";

const sectionLink = "text-sm font-semibold text-zinc-400 hover:text-white";

export default async function HomePage() {
  const [trending, latest] = await Promise.all([
    api.discover.tracks({ sort: "popular", limit: 6 }).catch(() => []),
    api.discover.tracks({ sort: "latest", limit: 6 }).catch(() => []),
  ]);
  const signedIn = (await getSessionUser()) !== null;
  const hasPlays = trending.some((track) => (track.playCount ?? 0) > 0);

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-28 text-white">
      <section className="bg-[radial-gradient(circle_at_72%_36%,#7c2d12_0%,#292524_32%,#09090b_74%)]">
        <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-7 sm:py-20">
          <h1 className="max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">
            Hear what&apos;s new from independent creators
          </h1>
          <p className="mt-4 max-w-xl text-base text-zinc-300 sm:text-lg">
            Stream tracks with live waveforms, or upload your own and share a link in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/discover"
              className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400"
            >
              Start listening
            </Link>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-600 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-400"
            >
              <Upload className="h-4 w-4" /> Upload a track
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] space-y-12 px-5 pt-10 sm:px-7">
        {latest.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 px-6 py-20 text-center">
            <p className="text-lg font-semibold">No tracks yet</p>
            <p className="mt-1 text-sm text-zinc-500">Be the first to share something.</p>
            <Link
              href="/upload"
              className="mt-5 inline-block rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold hover:bg-orange-400"
            >
              Upload a track
            </Link>
          </div>
        ) : (
          <>
            {hasPlays && (
              <section aria-labelledby="trending">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 id="trending" className="text-xl font-bold">
                    Trending now
                  </h2>
                  <Link href="/discover?sort=popular" className={sectionLink}>
                    See all
                  </Link>
                </div>
                <TrackGrid tracks={trending} />
              </section>
            )}
            <section aria-labelledby="latest">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 id="latest" className="text-xl font-bold">
                  New releases
                </h2>
                <Link href="/discover" className={sectionLink}>
                  See all
                </Link>
              </div>
              <TrackGrid tracks={latest} />
            </section>
          </>
        )}
        {signedIn && <WhoToFollow />}
      </div>
    </div>
  );
}
