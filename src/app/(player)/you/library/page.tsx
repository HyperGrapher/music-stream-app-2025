import Link from "next/link";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { TrackCard } from "@/app/_components/TrackCard";
import { requireUser } from "../requireUser";
import { api } from "@/trpc/server";

import type { PlayerTrack } from "@/types/player-track";

function Section({ title, href, children, empty }: { title: string; href: string; children: React.ReactNode; empty: boolean }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-bold">{title}</h2><Link href={href} className="text-sm text-orange-400 hover:underline">View all</Link></div>
      {empty ? <p className="text-sm text-zinc-500">Nothing here yet.</p> : children}
    </section>
  );
}

/** `/you/library` (LB-1): the latest six of each section. */
export default async function Page() {
  const user = await requireUser("/you/library");
  const [history, likes, playlists, albums, following] = await Promise.all([
    api.library.history({ limit: 6 }),
    api.profiles.tabPage({ username: user.username, tab: "likes" }),
    api.library.collections({ kind: "playlists" }),
    api.library.collections({ kind: "albums" }),
    api.profiles.follows({ username: user.username, direction: "following" }),
  ]);
  const recent = history.slice(0, 6).map((h) => h.track);
  const liked = likes.items.flatMap((item) => ("kind" in item && item.kind === "track" ? [item.track as PlayerTrack] : [])).slice(0, 6);
  return (
    <>
      <Section title="Recently played" href="/you/history" empty={recent.length === 0}>
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">{recent.map((t) => <li key={t.id}><TrackCard track={t} playlist={recent} context={{ name: "Recently played", source: "HISTORY" }} /></li>)}</ul>
      </Section>
      <Section title="Likes" href="/you/likes" empty={liked.length === 0}>
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">{liked.map((t) => <li key={t.id}><TrackCard track={t} playlist={liked} context={{ name: "Your likes", source: "LIBRARY" }} /></li>)}</ul>
      </Section>
      <Section title="Playlists" href="/you/sets" empty={playlists.items.length === 0}>
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">{playlists.items.slice(0, 6).map((c) => <li key={c.id}><CollectionCard collection={c} /></li>)}</ul>
      </Section>
      <Section title="Albums" href="/you/albums" empty={albums.items.length === 0}>
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">{albums.items.slice(0, 6).map((c) => <li key={c.id}><CollectionCard collection={c} /></li>)}</ul>
      </Section>
      <Section title="Following" href="/you/following" empty={following.items.length === 0}>
        <ul className="flex flex-wrap gap-4">{following.items.slice(0, 6).map((u) => <li key={u.id}><Link href={`/${u.username}`} className="text-sm text-zinc-200 hover:text-orange-400">{u.name}</Link></li>)}</ul>
      </Section>
    </>
  );
}
