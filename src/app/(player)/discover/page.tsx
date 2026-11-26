import type { Metadata } from "next";
import Link from "next/link";

import { TrackCarousel } from "@/app/_components/TrackCarousel";
import { getSessionUser } from "@/server/session-user";
import { DiscoverGrid } from "./DiscoverGrid";
import { genreLabel } from "@/lib/genres";
import { api } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Discover | Music Player",
  description: "Browse the newest and most played tracks.",
};

type Filters = { sort: "latest" | "popular"; genre?: string; q?: string };

/** Link that keeps the other filters and drops defaults, so URLs stay short and shareable. */
function href({ sort, genre, q }: Filters) {
  const params = new URLSearchParams();
  if (sort === "popular") params.set("sort", "popular");
  if (genre) params.set("genre", genre);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/discover?${query}` : "/discover";
}

const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "border-orange-500 bg-orange-700 text-white"
      : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
  }`;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; genre?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    sort: params.sort === "popular" ? "popular" : "latest",
    genre: params.genre?.slice(0, 50) || undefined,
    q: params.q?.trim().slice(0, 100) || undefined,
  };

  const user = await getSessionUser();
  const browsing = !filters.q && !filters.genre && filters.sort === "latest";
  const [tracks, genres, forYou, fresh] = await Promise.all([
    api.discover.tracks({ ...filters, limit: 48 }).catch(() => []),
    api.discover.genres().catch(() => []),
    user && browsing ? api.discover.forYou({ limit: 12 }).catch(() => []) : Promise.resolve([]),
    user && browsing ? api.discover.trending({ genre: (await api.account.me().catch(() => null))?.favoriteGenres?.[0], limit: 12 }).catch(() => []) : Promise.resolve([]),
  ]);

  const heading = filters.q
    ? `Results for “${filters.q}”`
    : filters.genre
      ? genreLabel(filters.genre)
      : "Discover";

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-28 text-white">
      <div className="mx-auto max-w-[1240px] px-5 pt-8 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{heading}</h1>
            {filters.q && (
              <Link href={href({ ...filters, q: undefined })} className="text-sm text-zinc-400 hover:text-white">
                Clear search
              </Link>
            )}
          </div>
          <nav aria-label="Sort" className="flex gap-2">
            <Link
              href={href({ ...filters, sort: "latest" })}
              className={chip(filters.sort === "latest")}
              aria-current={filters.sort === "latest" ? "page" : undefined}
            >
              Latest
            </Link>
            <Link
              href={href({ ...filters, sort: "popular" })}
              className={chip(filters.sort === "popular")}
              aria-current={filters.sort === "popular" ? "page" : undefined}
            >
              Most played
            </Link>
          </nav>
        </div>

        {genres.length > 0 && (
          <nav aria-label="Genres" className="mt-6 flex flex-wrap gap-2">
            <Link href={href({ ...filters, genre: undefined })} className={chip(!filters.genre)}>
              All
            </Link>
            {genres.map(({ genre, count }) => (
              <Link
                key={genre}
                href={href({ ...filters, genre })}
                className={chip(filters.genre === genre)}
                aria-current={filters.genre === genre ? "page" : undefined}
              >
                {genreLabel(genre)} <span className="text-xs opacity-70">{count}</span>
              </Link>
            ))}
          </nav>
        )}

        {user && browsing && (
          <div className="mt-8 space-y-10">
            <TrackCarousel id="made-for-you" title="Made for you" tracks={forYou} context={{ name: "Made for you", source: "DISCOVER" }} />
            <TrackCarousel id="fresh-genres" title="Fresh from your genres" tracks={fresh} context={{ name: "Fresh from your genres", source: "DISCOVER" }} />
          </div>
        )}

        <div className="mt-8">
          {tracks.length ? (
            <DiscoverGrid key={`${filters.sort}|${filters.genre ?? ""}|${filters.q ?? ""}`} initial={tracks} filters={filters} pageSize={48} />
          ) : (
            <div className="rounded border border-dashed border-zinc-800 px-6 py-20 text-center">
              <p className="text-lg font-semibold">
                {filters.q || filters.genre ? "Nothing matches that" : "No tracks yet"}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {filters.q || filters.genre
                  ? "Try a different search or genre."
                  : "Upload the first one."}
              </p>
              <Link
                href={filters.q || filters.genre ? "/discover" : "/upload"}
                className="mt-5 inline-block rounded-full bg-orange-700 px-5 py-2 text-sm font-semibold hover:bg-orange-600"
              >
                {filters.q || filters.genre ? "Browse everything" : "Upload a track"}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
