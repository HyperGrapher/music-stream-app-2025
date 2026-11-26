import type { Metadata } from "next";
import Link from "next/link";

import { genreLabel, GENRES } from "@/lib/genres";
import { api } from "@/trpc/server";

import { ChartList } from "./ChartList";

export const metadata: Metadata = { title: "Charts | Music Stream", description: "The most played and fastest rising tracks right now." };

const chip = (active: boolean) => `rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${active ? "border-orange-500 bg-orange-700 text-white" : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"}`;

/** `/charts` (CH-1, CH-2): Top 50 (7-day plays) and New & Hot, per genre, cached for 10 minutes. */
export default async function ChartsPage({ searchParams }: { searchParams: Promise<{ genre?: string; kind?: string }> }) {
  const { genre, kind } = await searchParams;
  const hot = kind === "hot";
  const g = GENRES.find((x) => x.value === genre)?.value;
  const entries = await (hot ? api.charts.newAndHot({ genre: g }) : api.charts.top({ genre: g })).catch(() => []);
  const href = (next: { genre?: string; kind?: string }) => {
    const params = new URLSearchParams();
    if (next.kind === "hot") params.set("kind", "hot");
    if (next.genre) params.set("genre", next.genre);
    const q = params.toString();
    return q ? `/charts?${q}` : "/charts";
  };
  return (
    <div className="mx-auto max-w-[1000px] px-5 pt-8 pb-28 text-white sm:px-7">
      <h1 className="text-3xl font-bold">Charts</h1>
      <nav aria-label="Chart" className="mt-5 flex gap-2">
        <Link href={href({ genre: g })} className={chip(!hot)} aria-current={!hot ? "page" : undefined}>Top 50</Link>
        <Link href={href({ genre: g, kind: "hot" })} className={chip(hot)} aria-current={hot ? "page" : undefined}>New &amp; Hot</Link>
      </nav>
      <nav aria-label="Genres" className="mt-4 flex flex-wrap gap-2">
        <Link href={href({ kind })} className={chip(!g)}>All music genres</Link>
        {GENRES.slice(0, 20).map((x) => <Link key={x.value} href={href({ kind, genre: x.value })} className={chip(g === x.value)}>{x.label}</Link>)}
      </nav>
      <h2 className="mt-8 mb-3 text-lg font-semibold text-zinc-300">{hot ? "New & Hot" : "Top 50"}{g ? `: ${genreLabel(g)}` : ""}</h2>
      <ChartList entries={entries.map((e) => ({ rank: e.rank, plays: e.plays, track: e.track }))} name={`${hot ? "New & Hot" : "Top 50"}${g ? `: ${genreLabel(g)}` : ""}`} />
    </div>
  );
}
