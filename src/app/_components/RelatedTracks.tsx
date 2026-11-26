"use client";

import { Headphones, Play } from "lucide-react";
import Link from "next/link";

import { TrackMenu } from "@/components/player/TrackMenu";
import { formatCount, formatDuration } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { api } from "@/trpc/react";

/** "Related tracks" sidebar of the track page (TR-8): same creator, co-likes, genre and tags. Hidden when there is nothing to show. */
export function RelatedTracks({ trackId }: { trackId: string }) {
  const related = api.tracks.related.useQuery({ trackId, limit: 12 }, { staleTime: 60_000 });
  const playContext = usePlayerStore((s) => s.playContext);
  const tracks = related.data ?? [];
  if (related.isLoading) return <div className="h-40 animate-pulse rounded-xl bg-zinc-900/70" aria-hidden />;
  if (tracks.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <h2 id="related-heading" className="pb-3 text-xs font-bold tracking-wide text-zinc-300 uppercase">Related tracks</h2>
      <ul className="space-y-3">
        {tracks.map((track) => (
          <li key={track.id} className="group flex items-center gap-3">
            <button type="button" onClick={() => playContext(tracks, track, { name: "Related tracks", source: "TRACK_PAGE" })} aria-label={`Play ${track.title}`} className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-zinc-800">
              <img src={track.artworkUrl ?? "/placeholder-track.jpg"} alt="" loading="lazy" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"><Play className="h-5 w-5 fill-white" /></span>
            </button>
            <div className="min-w-0 flex-1">
              <Link href={track.permalink ?? "#"} className="block truncate text-sm leading-6 font-semibold hover:text-orange-400">{track.title}</Link>
              <Link href={track.user?.username ? `/${track.user.username}` : "#"} className="block truncate py-1 text-xs text-zinc-400 hover:text-white">{track.user?.name}</Link>
              <p className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400"><Headphones className="h-3 w-3" /> {formatCount(track.playCount ?? 0)} · {formatDuration(track.duration)}</p>
            </div>
            <TrackMenu track={track} />
          </li>
        ))}
      </ul>
    </section>
  );
}
