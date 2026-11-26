"use client";

import { useShallow } from "zustand/react/shallow";
import { Flag, Heart, Link2, Pause, Play, Share2, Shuffle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { api } from "@/trpc/react";
import { startReport } from "@/components/player/ReportDialog";
import { RepostButton } from "./RepostButton";
import { absoluteUrl, copyText } from "@/components/player/TrackMenu";
import { useDialogs } from "@/store/dialogs";
import { usePlayerStore } from "@/store/player";
import type { PlayerTrack } from "@/types/player-track";

/** Like an album or playlist (LK-1): optimistic, rolled back on error, signed-out visitors are asked to sign in. */
function CollectionLike({ id, ownerId, isPrivate, initialLiked, initialCount, secret }: { id: string; ownerId: string; isPrivate: boolean; initialLiked: boolean; initialCount: number; secret?: string | null }) {
  const { user } = useUser();
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const mutation = api.engagement.setCollectionLike.useMutation();
  if (user?.id === ownerId) return <span className="inline-flex items-center gap-1 text-sm text-zinc-400"><Heart className="h-4 w-4" /> {state.count}</span>;
  const perform = (liked: boolean) => {
    if (mutation.isPending) return;
    const before = state;
    setState({ liked, count: Math.max(0, before.count + (liked === before.liked ? 0 : liked ? 1 : -1)) });
    mutation.mutate({ collectionId: id, liked, secret: secret ?? undefined }, {
      onSuccess: (r) => setState({ liked: r.liked, count: r.likeCount }),
      onError: (error) => { setState(before); toast.error(friendlyError(error, "Could not update your like")); },
    });
  };
  return (
    <Button type="button" variant="outline" aria-pressed={state.liked} aria-label={state.liked ? "Unlike collection" : "Like collection"} disabled={isPrivate && !state.liked}
      className={`rounded-full border-zinc-700 bg-transparent hover:bg-zinc-800 ${state.liked ? "border-orange-500/60 text-orange-400" : "text-white"}`}
      onClick={() => (user ? perform(!state.liked) : useAuthPrompt.getState().show("Sign in to like", () => perform(true)))}>
      <Heart className={`h-4 w-4 ${state.liked ? "fill-current" : ""}`} /> {state.count}
    </Button>
  );
}

/** Play / Shuffle / Share row of a collection page (PRD 8.4). */
export function CollectionActions({
  collection,
  tracks,
}: {
  collection: {
    id: string; title: string; permalink: string; visibility: string; viaSecret: boolean; secretToken: string | null;
    ownerId: string; likeCount: number; repostCount: number; likedByMe: boolean; repostedByMe: boolean;
  };
  tracks: PlayerTrack[];
}) {
  const { user } = useUser();
  const { playContext, toggleShuffle, togglePlay, status, contextCollectionId, shuffle } = usePlayerStore(useShallow((s) => ({
    playContext: s.playContext,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    status: s.status,
    contextCollectionId: s.contextCollectionId,
    shuffle: s.shuffle,
  })));
  const meta = { name: collection.title, source: "COLLECTION" as const, collectionId: collection.id };
  const isCurrent = contextCollectionId === collection.id && status !== "idle";
  const playing = isCurrent && status === "playing";
  const isPrivate = collection.visibility !== "PUBLIC";
  const secret = /\/s-([^/]+)$/.exec(collection.permalink)?.[1] ?? collection.secretToken;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button type="button" disabled={tracks.length === 0} onClick={() => (isCurrent ? togglePlay() : tracks[0] && playContext(tracks, tracks[0], meta))} className="rounded-full bg-orange-500 px-5 text-white hover:bg-orange-400">
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />} {playing ? "Pause" : "Play"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={tracks.length === 0}
        className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800"
        onClick={() => {
          const first = tracks[Math.floor(Math.random() * tracks.length)];
          if (!first) return;
          playContext(tracks, first, meta);
          if (!shuffle) toggleShuffle();
        }}
      >
        <Shuffle className="h-4 w-4" /> Shuffle
      </Button>
      <Button type="button" variant="outline" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => useDialogs.getState().openShare({ kind: "set", id: collection.id, title: collection.title, path: collection.permalink, isPrivate, secret: isPrivate ? secret : null })}>
        <Share2 className="h-4 w-4" /> Share
      </Button>
      <CollectionLike id={collection.id} ownerId={collection.ownerId} isPrivate={isPrivate} initialLiked={collection.likedByMe} initialCount={collection.likeCount} secret={isPrivate ? secret : null} />
      <RepostButton kind="collection" id={collection.id} ownerId={collection.ownerId} isPrivate={isPrivate} initialReposted={collection.repostedByMe} initialCount={collection.repostCount} variant="pill" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-700 px-3 text-sm text-white hover:bg-zinc-800" />
      {user?.id !== collection.ownerId && (
        <Button type="button" variant="outline" size="icon" aria-label="Report" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => startReport(!!user, { targetType: "COLLECTION", targetId: collection.id, label: collection.title })}>
          <Flag className="h-4 w-4" />
        </Button>
      )}
      <Button type="button" variant="outline" size="icon" aria-label="Copy link" className="rounded-full border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => copyText(absoluteUrl(collection.permalink))}>
        <Link2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
