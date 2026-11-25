"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayAt } from "@/hooks/usePlayAt";
import { formatDuration } from "@/lib/utils";
import { parseAccessQuery } from "@/lib/access-client";
import { api } from "@/trpc/react";
import type { PlayerTrack } from "@/types/player-track";

/** Avatars under the waveform, one per timed comment, placed at the moment it was written. */
export function CommentMarkers({ track }: { track: PlayerTrack }) {
  const { data } = api.comments.list.useQuery({
    trackId: track.id,
    access: parseAccessQuery(track.accessQuery),
  });
  const playAt = usePlayAt(track);
  if (!track.duration || !data) return null;

  const timed = data.comments.filter((comment) => comment.timestampSeconds !== null);
  if (!timed.length) return null;

  return (
    <div className="relative mt-1.5 h-7" aria-label="Comments on the waveform">
      {timed.map((comment) => {
        const seconds = comment.timestampSeconds!;
        const left = Math.min(100, Math.max(0, (seconds / track.duration) * 100));
        return (
          <button
            key={comment.id}
            type="button"
            onClick={() => playAt(seconds)}
            style={{ left: `${left}%` }}
            title={`${comment.author.name} at ${formatDuration(seconds)}: ${comment.content}`}
            aria-label={`${comment.author.name} commented at ${formatDuration(seconds)}`}
            className="absolute top-0 -translate-x-1/2 rounded-full ring-2 ring-black transition hover:z-10 hover:scale-125"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={comment.author.image ?? ""} alt="" />
              <AvatarFallback className="text-[10px]">{comment.author.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </button>
        );
      })}
    </div>
  );
}
