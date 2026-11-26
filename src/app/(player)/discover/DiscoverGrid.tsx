"use client";

import { useEffect, useRef, useState } from "react";

import { TrackGrid } from "@/app/_components/TrackGrid";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

/** The Discover grid with infinite scroll (DI-3): further pages load as the sentinel nears the viewport, with a button as the fallback. */
export function DiscoverGrid({ initial, filters, pageSize }: { initial: PlayerTrack[]; filters: { sort: "latest" | "popular"; genre?: string; q?: string }; pageSize: number }) {
  const utils = api.useUtils();
  const [tracks, setTracks] = useState(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const next = await utils.discover.tracks.fetch({ ...filters, limit: pageSize, offset: tracks.length });
      setTracks((current) => [...current, ...next.filter((t) => !current.some((c) => c.id === t.id))]);
      if (next.length < pageSize) setDone(true);
    } finally {
      setLoading(false);
    }
  };
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || done || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void latest.current(); }, { rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [done, tracks.length]);

  return (
    <>
      <TrackGrid tracks={tracks} context={{ name: filters.q ? `Search: ${filters.q}` : "Discover", source: filters.q ? "SEARCH" : "DISCOVER" }} />
      {!done && <div ref={sentinel} className="py-8 text-center"><Button variant="outline" disabled={loading} onClick={() => void load()} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">{loading ? "Loading..." : "Load more"}</Button></div>}
    </>
  );
}
