import Link from "next/link";

import { Carousel } from "@/app/_components/Carousel";
import { CollectionCard } from "@/app/_components/CollectionCard";
import { TrackCarousel } from "@/app/_components/TrackCarousel";
import { TrackGrid } from "@/app/_components/TrackGrid";
import { WhoToFollow } from "@/app/_components/WhoToFollow";
import { genreLabel } from "@/lib/genres";
import { getSessionUser } from "@/server/session-user";
import { api } from "@/trpc/server";
import type { PlayerTrack } from "@/types/player-track";

const sectionLink = "text-sm font-semibold text-zinc-400 hover:text-white";

async function firstGenres() {
  const me = await api.account.me().catch(() => null);
  return me?.favoriteGenres?.slice(0, 3) ?? [];
}

/** `/`: a landing page for visitors, a personalised Home (PRD 10.1) once signed in. Every module hides itself when empty. */
export default async function HomePage() {
  const user = await getSessionUser();
  const [chart, popular, latest, releases] = await Promise.all([
    api.charts.top({ limit: 12 }).catch(() => []),
    api.discover.tracks({ sort: "popular", limit: 12 }).catch(() => []),
    api.discover.tracks({ sort: "latest", limit: 12 }).catch(() => []),
    api.discover.newReleases({ limit: 12 }).catch(() => []),
  ]);
  // Trending = the 7-day chart; before any daily stats exist, the most played tracks.
  const trending: PlayerTrack[] = chart.length > 0 ? chart.map((c) => c.track) : popular.filter((t) => (t.playCount ?? 0) > 0);

  const personal = user
    ? await Promise.all([
        api.library.history({ limit: 12 }).catch(() => []),
        api.discover.forYou({ limit: 12 }).catch(() => []),
        api.discover.following({ limit: 12 }).catch(() => []),
        firstGenres(),
      ])
    : null;
  const genreRows = personal ? await Promise.all(personal[3].map(async (genre) => ({ genre, tracks: await api.discover.trending({ genre, limit: 12 }).catch(() => []) }))) : [];
  const genres = !user ? await api.discover.genres().catch(() => []) : [];
  const creators = !user ? await api.profiles.suggestions({ limit: 6 }).catch(() => []) : [];

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-28 text-white">
      {!user && (
        <section className="bg-[radial-gradient(circle_at_72%_36%,#7c2d12_0%,#292524_32%,#09090b_74%)]">
          <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-7 sm:py-20">
            <h1 className="max-w-2xl text-3xl leading-tight font-bold sm:text-5xl">Hear what&apos;s new from independent creators</h1>
            <p className="mt-4 max-w-xl text-base text-zinc-300 sm:text-lg">Stream tracks with live waveforms, or upload your own and share a link in seconds.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400">Sign up free</Link>
              <Link href="/signin" className="rounded-full border border-zinc-600 px-6 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-400">Sign in</Link>
              <Link href="/discover" className="rounded-full px-6 py-2.5 text-sm font-semibold text-zinc-300 hover:text-white">Start listening</Link>
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto max-w-[1240px] space-y-12 px-5 pt-10 sm:px-7">
        {user && personal && (
          <>
            <TrackCarousel id="recent" title="Recently played" href="/you/history" tracks={personal[0].map((h) => h.track)} context={{ name: "Recently played", source: "HISTORY" }} />
            <TrackCarousel id="for-you" title="More of what you like" tracks={personal[1]} context={{ name: "More of what you like", source: "HOME" }} />
            <TrackCarousel id="following" title="New from people you follow" href="/feed" tracks={personal[2]} context={{ name: "New from people you follow", source: "HOME" }} />
            {genreRows.map((row) => (
              <TrackCarousel key={row.genre} id={`trending-${row.genre}`} title={`Trending in ${genreLabel(row.genre)}`} href={`/charts?genre=${row.genre}`} tracks={row.tracks} context={{ name: `Trending in ${genreLabel(row.genre)}`, source: "HOME" }} />
            ))}
          </>
        )}

        {latest.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-800 px-6 py-20 text-center">
            <p className="text-lg font-semibold">No tracks yet</p>
            <p className="mt-1 text-sm text-zinc-500">Be the first to share something.</p>
            <Link href="/upload" className="mt-5 inline-block rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold hover:bg-orange-400">Upload a track</Link>
          </div>
        ) : (
          <>
            {trending.length > 0 && (
              <section aria-labelledby="trending">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 id="trending" className="text-xl font-bold">Trending now</h2>
                  <Link href="/charts" className={sectionLink}>Charts</Link>
                </div>
                <TrackGrid tracks={trending.slice(0, 6)} context={{ name: "Trending now", source: "HOME" }} />
              </section>
            )}
            {releases.length > 0 && (
              <Carousel id="releases" title="New releases" href="/discover">
                {releases.map((collection) => <CollectionCard key={collection.id} collection={collection} />)}
              </Carousel>
            )}
            <section aria-labelledby="latest">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 id="latest" className="text-xl font-bold">Fresh tracks</h2>
                <Link href="/discover" className={sectionLink}>See all</Link>
              </div>
              <TrackGrid tracks={latest.slice(0, 6)} context={{ name: "Fresh tracks", source: "HOME" }} />
            </section>
          </>
        )}

        {!user && genres.length > 0 && (
          <section aria-labelledby="genres">
            <h2 id="genres" className="mb-4 text-xl font-bold">Browse by genre</h2>
            <ul className="flex flex-wrap gap-3">
              {genres.slice(0, 12).map(({ genre }) => (
                <li key={genre}><Link href={`/discover?genre=${genre}`} className="block rounded-lg bg-zinc-900 px-5 py-4 font-semibold hover:bg-zinc-800">{genreLabel(genre)}</Link></li>
              ))}
            </ul>
          </section>
        )}
        {!user && creators.length > 0 && (
          <section aria-labelledby="creators">
            <h2 id="creators" className="mb-4 text-xl font-bold">Popular creators</h2>
            <ul className="flex flex-wrap gap-4">{creators.map((c) => <li key={c.id}><Link href={`/${c.username}`} className="text-sm font-semibold text-zinc-200 hover:text-orange-400">{c.name}</Link></li>)}</ul>
          </section>
        )}
        {user && <WhoToFollow />}
      </div>
    </div>
  );
}
