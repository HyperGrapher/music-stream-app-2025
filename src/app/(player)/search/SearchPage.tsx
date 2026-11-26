"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { TrackCard } from "@/app/_components/TrackCard";
import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

type Tab = "all" | "tracks" | "people" | "albums" | "playlists";
type TrackFilters = { genre?: string; duration?: string; added?: string; license?: string };
const TAB_LABEL: Record<Tab, string> = { all: "Everything", tracks: "Tracks", people: "People", albums: "Albums", playlists: "Playlists" };
type Person = RouterOutputs["search"]["people"]["items"][number];

function PersonCard({ person }: { person: Person }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <Link href={`/${person.username}`}><Avatar className="h-12 w-12"><AvatarImage src={person.image ?? ""} alt="" /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar></Link>
      <div className="min-w-0 flex-1">
        <Link href={`/${person.username}`} className="block truncate font-semibold hover:text-orange-400">{person.name}</Link>
        <p className="text-xs text-zinc-400">{person.followerCount} followers · {person.trackCount} tracks</p>
      </div>
      <FollowButton userId={person.id} initialFollowing={person.followedByMe} size="sm" />
    </li>
  );
}

function Select({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200">
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

/** Generic "first page from the query, further pages on demand" list. */
function usePaged<T>(first: { items: T[]; nextOffset: number | null } | undefined, fetchMore: (offset: number) => Promise<{ items: T[]; nextOffset: number | null }>) {
  const [more, setMore] = useState<T[]>([]);
  const [offset, setOffset] = useState<number | null | undefined>(undefined);
  const next = offset === undefined ? (first?.nextOffset ?? null) : offset;
  return {
    items: [...(first?.items ?? []), ...more],
    next,
    loadMore: async () => {
      if (next === null) return;
      const page = await fetchMore(next);
      setMore((m) => [...m, ...page.items]);
      setOffset(page.nextOffset);
    },
  };
}

function NoResults({ q }: { q: string }) {
  const trending = api.discover.tracks.useQuery({ sort: "popular", limit: 6 });
  const tracks = trending.data ?? [];
  return (
    <div className="rounded border border-dashed border-zinc-800 px-6 py-12 text-center" data-testid="no-results">
      <p className="text-lg font-semibold">No results for “{q}”</p>
      <p className="mt-1 text-sm text-zinc-400">Check the spelling, try fewer words, or browse what’s trending.</p>
      {tracks.length > 0 && <ul className="mx-auto mt-6 grid max-w-3xl grid-cols-2 gap-4 text-left sm:grid-cols-3">{tracks.map((t) => <li key={t.id}><TrackCard track={t} playlist={tracks} context={{ name: "Trending", source: "SEARCH" }} /></li>)}</ul>}
    </div>
  );
}

/** `/search?q=` (SE-2, SE-3, SE-5): Everything / Tracks / People / Albums / Playlists, track filters, never an empty page. */
export function SearchPage({ q, tab, filters }: { q: string; tab: Tab; filters: TrackFilters }) {
  const router = useRouter();
  const utils = api.useUtils();
  const go = (next: { tab?: Tab; filters?: TrackFilters }) => {
    const params = new URLSearchParams({ q });
    const t = next.tab ?? tab;
    if (t !== "all") params.set("tab", t);
    for (const [k, v] of Object.entries(next.filters ?? filters)) if (v) params.set(k, v);
    router.push(`/search?${params.toString()}`);
  };
  const enabled = q.length > 0;
  const f = {
    genre: filters.genre || undefined,
    duration: (filters.duration || undefined) as "short" | "medium" | "long" | "epic" | undefined,
    added: (filters.added || undefined) as "hour" | "day" | "week" | "month" | "year" | undefined,
    license: (filters.license || undefined) as "share" | "commercial" | "modify" | undefined,
  };

  const tracksQ = api.search.tracks.useQuery({ q, ...f, offset: 0 }, { enabled: enabled && (tab === "all" || tab === "tracks") });
  const peopleQ = api.search.people.useQuery({ q, offset: 0 }, { enabled: enabled && (tab === "all" || tab === "people") });
  const albumsQ = api.search.collections.useQuery({ q, kind: "albums", offset: 0 }, { enabled: enabled && (tab === "all" || tab === "albums") });
  const playlistsQ = api.search.collections.useQuery({ q, kind: "playlists", offset: 0 }, { enabled: enabled && (tab === "all" || tab === "playlists") });

  const tracks = usePaged(tracksQ.data, (offset) => utils.search.tracks.fetch({ q, ...f, offset }));
  const people = usePaged(peopleQ.data, (offset) => utils.search.people.fetch({ q, offset }));
  const albums = usePaged(albumsQ.data, (offset) => utils.search.collections.fetch({ q, kind: "albums", offset }));
  const playlists = usePaged(playlistsQ.data, (offset) => utils.search.collections.fetch({ q, kind: "playlists", offset }));

  const loading = [tracksQ, peopleQ, albumsQ, playlistsQ].some((query) => query.isLoading && query.fetchStatus !== "idle");
  const everythingEmpty = !loading && tracks.items.length + people.items.length + albums.items.length + playlists.items.length === 0;
  const queue = tracks.items as PlayerTrack[];
  const firstPerson = people.items[0];
  const firstTrack = tracks.items[0];
  const personFirst = !!firstPerson && (firstPerson.username.startsWith(q.toLowerCase()) || firstPerson.name.toLowerCase().startsWith(q.toLowerCase()));
  const top: { person: Person } | { track: NonNullable<typeof firstTrack> } | null = personFirst ? { person: firstPerson } : firstTrack ? { track: firstTrack } : null;
  const more = (label: string, next: number | null, load: () => Promise<void>) => next !== null && <div className="mt-4 text-center"><Button variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => void load()}>{label}</Button></div>;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-white">
      <h1 className="text-2xl font-bold">{q ? <>Results for “{q}”</> : "Search"}</h1>
      <div role="tablist" className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go({ tab: t })} className={cn("rounded-full border px-3 py-1 text-sm", tab === t ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}>{TAB_LABEL[t]}</button>
        ))}
      </div>

      {!q && <p className="mt-8 text-zinc-400">Type something in the search box to find tracks, people, albums and playlists.</p>}
      {loading && <p className="mt-8 text-sm text-zinc-400">Searching…</p>}
      {q && everythingEmpty && <div className="mt-8"><NoResults q={q} /></div>}

      {tab === "tracks" && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Track filters">
          <Select label="Any genre" value={filters.genre} options={GENRES.map((g) => [g.value, g.label])} onChange={(genre) => go({ filters: { ...filters, genre } })} />
          <Select label="Any length" value={filters.duration} options={[["short", "Under 2 min"], ["medium", "2–10 min"], ["long", "10–30 min"], ["epic", "Over 30 min"]]} onChange={(duration) => go({ filters: { ...filters, duration } })} />
          <Select label="Any time" value={filters.added} options={[["hour", "Past hour"], ["day", "Past day"], ["week", "Past week"], ["month", "Past month"], ["year", "Past year"]]} onChange={(added) => go({ filters: { ...filters, added } })} />
          <Select label="Any license" value={filters.license} options={[["share", "To share"], ["commercial", "To use commercially"], ["modify", "To modify commercially"]]} onChange={(license) => go({ filters: { ...filters, license } })} />
        </div>
      )}

      {tab === "all" && !everythingEmpty && top && (
        <section className="mt-6" aria-label="Top result">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-zinc-400 uppercase">Top result</h2>
          {"person" in top ? <ul><PersonCard person={top.person} /></ul> : <WaveformTrackItem track={top.track} playlist={queue} context={{ name: `Search: ${q}`, source: "SEARCH" }} compact />}
        </section>
      )}

      {(tab === "all" || tab === "people") && people.items.length > 0 && (
        <section className="mt-8"><div className="mb-3 flex justify-between"><h2 className="text-lg font-bold">People</h2>{tab === "all" && <button className="text-sm text-orange-400" onClick={() => go({ tab: "people" })}>See all</button>}</div>
          <ul className="grid gap-3 sm:grid-cols-2">{(tab === "all" ? people.items.slice(0, 4) : people.items).map((p) => <PersonCard key={p.id} person={p} />)}</ul>
          {tab === "people" && more("Load more", people.next, people.loadMore)}
        </section>
      )}

      {(tab === "all" || tab === "tracks") && tracks.items.length > 0 && (
        <section className="mt-8"><div className="mb-3 flex justify-between"><h2 className="text-lg font-bold">Tracks</h2>{tab === "all" && <button className="text-sm text-orange-400" onClick={() => go({ tab: "tracks" })}>See all</button>}</div>
          {(tab === "all" ? tracks.items.slice(0, 5) : tracks.items).map((track) => <WaveformTrackItem key={track.id} track={track} playlist={queue} context={{ name: `Search: ${q}`, source: "SEARCH" }} compact />)}
          {tab === "tracks" && more("Load more", tracks.next, tracks.loadMore)}
        </section>
      )}

      {(tab === "all" || tab === "albums") && albums.items.length > 0 && (
        <section className="mt-8"><div className="mb-3 flex justify-between"><h2 className="text-lg font-bold">Albums</h2>{tab === "all" && <button className="text-sm text-orange-400" onClick={() => go({ tab: "albums" })}>See all</button>}</div>
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{(tab === "all" ? albums.items.slice(0, 4) : albums.items).map((c) => <li key={c.id}><CollectionCard collection={c} /></li>)}</ul>
          {tab === "albums" && more("Load more", albums.next, albums.loadMore)}
        </section>
      )}

      {(tab === "all" || tab === "playlists") && playlists.items.length > 0 && (
        <section className="mt-8"><div className="mb-3 flex justify-between"><h2 className="text-lg font-bold">Playlists</h2>{tab === "all" && <button className="text-sm text-orange-400" onClick={() => go({ tab: "playlists" })}>See all</button>}</div>
          <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{(tab === "all" ? playlists.items.slice(0, 4) : playlists.items).map((c) => <li key={c.id}><CollectionCard collection={c} /></li>)}</ul>
          {tab === "playlists" && more("Load more", playlists.next, playlists.loadMore)}
        </section>
      )}
    </div>
  );
}
