"use client";

import { Repeat2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { Button } from "@/components/ui/button";
import { api, type RouterOutputs } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

type TabPage = RouterOutputs["profiles"]["tabPage"];
export type ProfileTab = "all" | "popular-tracks" | "tracks" | "albums" | "sets" | "reposts" | "likes";

type Item = TabPage["items"][number];

function trackOf(item: Item): PlayerTrack | null {
  if ("kind" in item) return item.kind === "track" ? (item as { track: PlayerTrack }).track : null;
  return "slug" in item && "durationMs" in item ? (item as unknown as PlayerTrack) : null;
}

/**
 * One profile tab (PRD PR-1..PR-3): the server rendered the first 20 items; further pages load on
 * scroll (IntersectionObserver) with a "Load more" button as the fallback.
 */
export function ProfileList({ username, tab, initial, empty }: { username: string; tab: ProfileTab; initial: TabPage; empty: string }) {
  const utils = api.useUtils();
  const [items, setItems] = useState<Item[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const next = await utils.profiles.tabPage.fetch({ username, tab, cursor });
      setItems((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } finally {
      setLoading(false);
    }
  };
  const latest = useRef(loadMore);
  useEffect(() => {
    latest.current = loadMore;
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void latest.current();
    }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor]);

  if (items.length === 0) {
    return <div className="rounded border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-500">{empty}</div>;
  }

  const queue = items.flatMap((item) => trackOf(item) ?? []);
  const collectionGrid: Item[] = [];
  const rows: React.ReactNode[] = [];
  const flushGrid = () => {
    if (collectionGrid.length === 0) return;
    const group = collectionGrid.splice(0);
    rows.push(
      <ul key={`grid-${rows.length}`} className="grid grid-cols-2 gap-5 py-5 sm:grid-cols-3 xl:grid-cols-4">
        {group.map((item) => {
          const collection = "collection" in item ? item.collection : (item as never);
          const reposted = "reposted" in item && item.reposted;
          return (
            <li key={("id" in item ? item.id : undefined) ?? collection.id}>
              <CollectionCard collection={collection} badge={reposted ? "Reposted" : undefined} />
            </li>
          );
        })}
      </ul>,
    );
  };
  for (const item of items) {
    const track = trackOf(item);
    if (track) {
      flushGrid();
      const reposted = "reposted" in item && item.reposted;
      rows.push(
        <div key={("id" in item && typeof item.id === "string" && "kind" in item ? item.id : track.id)}>
          {reposted && (
            <p className="flex items-center gap-1.5 pt-4 text-xs font-semibold text-zinc-400">
              <Repeat2 className="h-3.5 w-3.5" /> {username} reposted
            </p>
          )}
          <WaveformTrackItem track={track} playlist={queue} />
        </div>,
      );
    } else {
      collectionGrid.push(item);
    }
  }
  flushGrid();

  return (
    <div>
      {rows}
      {cursor && (
        <div ref={sentinel} className="py-6 text-center">
          <Button type="button" variant="outline" disabled={loading} onClick={() => void loadMore()} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
