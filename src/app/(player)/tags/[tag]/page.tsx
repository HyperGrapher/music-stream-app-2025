import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { TrackGrid } from "@/app/_components/TrackGrid";
import { genreLabel } from "@/lib/genres";
import { api } from "@/trpc/server";

type Params = Promise<{ tag: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tag } = await params;
  return { title: `#${decodeURIComponent(tag)} | Music Stream` };
}

const chip = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-medium ${active ? "border-orange-500 bg-orange-700 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`;

/** `/tags/[tag]` (GT-2): public tracks and collections with that tag (or genre), Popular or Latest. */
export default async function TagPage({ params, searchParams }: { params: Params; searchParams: Promise<{ sort?: string }> }) {
  const [{ tag: raw }, { sort }] = await Promise.all([params, searchParams]);
  const tag = decodeURIComponent(raw).toLowerCase();
  if (!/^[\p{L}\p{N}_-]{1,40}$/u.test(tag)) notFound();
  const order = sort === "latest" ? "latest" : "popular";
  const result = await api.discover.byTag({ tag, sort: order });
  return (
    <div className="mx-auto max-w-[1240px] px-5 pt-8 pb-28 text-white sm:px-7">
      <h1 className="text-3xl font-bold">#{genreLabel(tag)}</h1>
      <nav aria-label="Sort" className="mt-4 flex gap-2">
        <Link href={`/tags/${encodeURIComponent(tag)}`} className={chip(order === "popular")}>Popular</Link>
        <Link href={`/tags/${encodeURIComponent(tag)}?sort=latest`} className={chip(order === "latest")}>Latest</Link>
      </nav>
      {result.tracks.length === 0 && result.collections.length === 0 ? (
        <p className="mt-10 rounded border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-400">Nothing is tagged #{tag} yet.</p>
      ) : (
        <>
          {result.collections.length > 0 && <ul className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-6">{result.collections.map((c) => <li key={c.id}><CollectionCard collection={c} /></li>)}</ul>}
          {result.tracks.length > 0 && <div className="mt-8"><TrackGrid tracks={result.tracks} /></div>}
        </>
      )}
    </div>
  );
}
