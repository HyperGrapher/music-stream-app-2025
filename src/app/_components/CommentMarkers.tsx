"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/useUser";
import { usePlayAt } from "@/hooks/usePlayAt";
import { formatDuration } from "@/lib/utils";
import { clusterMarkers } from "@/lib/marker-clusters";
import { parseAccessQuery } from "@/lib/access-client";
import { usePlayerStore } from "@/store/player";
import { api } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

/** How long a comment bubble stays up after the playhead passes its moment. */
export const BUBBLE_SECONDS = 4;

interface Marker { id: string; seconds: number; author: { name: string; image: string | null }; content: string }

/** Avatars under the waveform, one per timed comment (clustered when crowded), plus a bubble for the comment being passed while playing. */
export function CommentMarkers({ track }: { track: PlayerTrack }) {
  const { user } = useUser();
  const { data } = api.comments.list.useQuery({
    trackId: track.id,
    access: parseAccessQuery(track.accessQuery),
  });
  const settings = api.account.me.useQuery(undefined, { enabled: !!user, staleTime: 60_000 });
  const playAt = usePlayAt(track);
  const currentTime = usePlayerStore((state) => (state.currentTrack?.id === track.id && state.status === "playing" ? state.currentTime : -1));
  if (!track.duration || !data) return null;
  if (settings.data?.showWaveformComments === false) return null;

  const timed: Marker[] = data.comments.flatMap((comment) =>
    comment.timestampSeconds === null ? [] : [{ id: comment.id, seconds: comment.timestampSeconds, author: comment.author, content: comment.content }],
  );
  if (!timed.length) return null;
  const groups = clusterMarkers(timed, track.duration);
  const live = currentTime >= 0 ? timed.filter((m) => m.seconds <= currentTime && currentTime - m.seconds < BUBBLE_SECONDS).at(-1) : undefined;
  const position = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / track.duration) * 100))}%`;

  return (
    <div className="relative mt-1.5 h-7" aria-label="Comments on the waveform">
      {live ? (
        <div role="status" style={{ left: position(live.seconds) }} className="absolute bottom-full z-20 mb-1 max-w-56 -translate-x-1/2 truncate rounded bg-zinc-800 px-2 py-1 text-xs text-white shadow-lg">
          <strong>{live.author.name}</strong> {live.content}
        </div>
      ) : null}
      {groups.map((group) => {
        const first = group[0]!;
        const label =
          group.length === 1
            ? `${first.author.name} commented at ${formatDuration(first.seconds)}`
            : `${group.length} comments from ${formatDuration(first.seconds)}`;
        return (
          <button
            key={first.id}
            type="button"
            onClick={() => playAt(first.seconds)}
            style={{ left: position(first.seconds) }}
            title={group.length === 1 ? `${first.author.name} at ${formatDuration(first.seconds)}: ${first.content}` : label}
            aria-label={label}
            className="absolute top-0 -translate-x-1/2 rounded-full ring-2 ring-black transition hover:z-10 hover:scale-125"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={first.author.image ?? ""} alt="" />
              <AvatarFallback className="text-[10px]">{first.author.name.charAt(0)}</AvatarFallback>
            </Avatar>
            {group.length > 1 ? <span className="absolute -top-1 -right-1 rounded-full bg-orange-700 px-1 text-[9px] leading-3 font-bold text-white">{group.length}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
