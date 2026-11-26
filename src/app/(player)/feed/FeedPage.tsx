"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { Button } from "@/components/ui/button";
import { FeedSkeleton } from "@/components/ui/feed-skeleton";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

type Item = RouterOutputs["feed"]["list"]["items"][number];
const TABS = [["all", "All"], ["tracks", "Tracks"], ["sets", "Albums & playlists"], ["reposts", "Reposts"]] as const;

function header(item: Item) {
  const names = item.actors.map((a) => a.name);
  const others = item.actorCount - names.length;
  const who = others > 0 ? `${names.join(", ")} and ${others} ${others === 1 ? "other" : "others"}` : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "Someone");
  const what = item.track ? "a track" : (item.collection?.isPlaylist ? "a playlist" : "a release");
  return item.verb === "reposted" ? `${who} reposted` : `${who} posted ${what}`;
}

/** `/feed` (FD-1..FD-7): chronological, de-duplicated, with tabs, "New posts" pill and cursor pagination. Rows played in sequence form the queue "Your feed". */
export function FeedPage({ empty }: { empty: ReactNode }) {
  const utils = api.useUtils();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("all");
  const [pages, setPages] = useState<Item[][]>([]);
  const [cursor, setCursor] = useState<RouterOutputs["feed"]["list"]["nextCursor"] | undefined>(undefined);
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const first = api.feed.list.useQuery({ tab }, { refetchOnWindowFocus: false });
  const newer = api.feed.newCount.useQuery({ since: loadedAt }, { refetchInterval: 60_000, refetchIntervalInBackground: false });

  const items = useMemo(() => [...(first.data?.items ?? []), ...pages.flat()], [first.data, pages]);
  const next = cursor === undefined ? first.data?.nextCursor : cursor;
  const playable = useMemo(() => items.flatMap((i) => (i.track ? [i.track as PlayerTrack] : [])), [items]);
  const newCount = newer.data ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-white">
      <h1 className="text-2xl font-bold">Your feed</h1>
      <div role="tablist" className="mt-4 flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setPages([]); setCursor(undefined); setLoadedAt(new Date()); }} className={cn("rounded-full border px-3 py-1 text-sm", tab === value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}>{label}</button>
        ))}
      </div>

      {newCount > 0 ? (
        <button type="button" className="sticky top-2 z-10 mx-auto mt-4 block rounded-full bg-orange-700 px-4 py-1.5 text-sm font-semibold text-white shadow-lg" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); void first.refetch(); setPages([]); setCursor(undefined); setLoadedAt(new Date()); void utils.feed.newCount.invalidate(); }}>
          {newCount} new {newCount === 1 ? "post" : "posts"}
        </button>
      ) : null}

      <div className="mt-6">
        {first.isLoading ? <FeedSkeleton /> : null}
        {!first.isLoading && items.length === 0 ? (
          <div className="space-y-6">
            <p className="text-zinc-300">Follow creators to fill your feed.</p>
            {empty}
          </div>
        ) : null}
        {items.map((item) => (
          <article key={item.id} className="mb-2" data-testid="feed-item">
            <p className="mb-2 text-xs text-zinc-400">
              {item.actors[0] ? <Link href={`/${item.actors[0].username}`} className="font-semibold text-zinc-200 hover:text-orange-400">{header(item)}</Link> : header(item)}
              {" · "}
              <time dateTime={new Date(item.at).toISOString()}>{formatDistanceToNowStrict(new Date(item.at))}</time>
            </p>
            {item.caption ? <p className="mb-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-200" data-testid="repost-caption">&ldquo;{item.caption}&rdquo;</p> : null}
            {item.track ? (
              <WaveformTrackItem track={item.track} playlist={playable} context={{ name: "Your feed", source: "FEED" }} compact />
            ) : item.collection ? (
              <div className="max-w-[220px] pb-6"><CollectionCard collection={item.collection} /></div>
            ) : null}
          </article>
        ))}
      </div>
      {next ? (
        <div className="mt-4 text-center">
          <Button variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={async () => {
            const page = await utils.feed.list.fetch({ tab, cursor: next });
            const seen = new Set(items.map((i) => (i.track ? `t${i.track.id}` : `c${i.collection?.id}`)));
            setPages((current) => [...current, page.items.filter((i) => !seen.has(i.track ? `t${i.track.id}` : `c${i.collection?.id}`))]);
            setCursor(page.nextCursor);
          }}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}
