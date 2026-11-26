"use client";

import { FeedSkeleton } from "@/components/ui/feed-skeleton";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

/** `/you/history` (LB-6): the last 200 distinct tracks you played, with "Clear listening history". */
export function HistoryList() {
  const utils = api.useUtils();
  const [confirming, setConfirming] = useState(false);
  const history = api.library.history.useQuery();
  const clear = api.library.clearHistory.useMutation({
    onSuccess: () => { setConfirming(false); toast.success("Listening history cleared"); void utils.library.history.invalidate(); },
  });
  const tracks = (history.data ?? []).map((h) => h.track);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Listening history</h1>
        {tracks.length > 0 && (confirming ? (
          <span className="flex items-center gap-2 text-sm">Clear it for good? <Button size="sm" variant="destructive" onClick={() => clear.mutate()}>Clear</Button><Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button></span>
        ) : (
          <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => setConfirming(true)}>Clear listening history</Button>
        ))}
      </div>
      {history.isLoading && <div className="mt-6"><FeedSkeleton /></div>}
      {history.data?.length === 0 && <p className="mt-10 text-center text-sm text-zinc-400">Tracks you listen to will show up here.</p>}
      <div className="mt-4">
        {(history.data ?? []).map((entry) => (
          <div key={entry.track.id}>
            <p className="pt-3 text-xs text-zinc-400">Played {formatDistanceToNowStrict(new Date(entry.playedAt), { addSuffix: true })}</p>
            <WaveformTrackItem track={entry.track} playlist={tracks} context={{ name: "Listening history", source: "HISTORY" }} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
