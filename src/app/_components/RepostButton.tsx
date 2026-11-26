"use client";

import { Repeat2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/hooks/useUser";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { useAuthPrompt } from "@/store/authPrompt";
import { api } from "@/trpc/react";

interface Props {
  kind: "track" | "collection";
  id: string;
  /** Owner: you cannot repost your own content (RP-1), so only the count shows. */
  ownerId?: string;
  isPrivate?: boolean;
  initialReposted?: boolean;
  initialCount?: number;
  variant: "pill" | "round";
  className: string;
}

/** Repost / un-repost with optimistic update and rollback (RP-1). */
export function RepostButton({ kind, id, ownerId, isPrivate = false, initialReposted = false, initialCount = 0, variant, className }: Props) {
  const { user } = useUser();
  const [state, setState] = useState({ reposted: initialReposted, count: initialCount });
  const trackMutation = api.engagement.setTrackRepost.useMutation();
  const collectionMutation = api.engagement.setCollectionRepost.useMutation();
  const pending = trackMutation.isPending || collectionMutation.isPending;

  if (user && ownerId === user.id) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400" title="Reposts"><Repeat2 className="h-3.5 w-3.5" /> {state.count}</span>;
  }

  const perform = (reposted: boolean) => {
    if (pending) return;
    const before = state;
    setState({ reposted, count: Math.max(0, before.count + (reposted === before.reposted ? 0 : reposted ? 1 : -1)) });
    const onSuccess = (result: { reposted: boolean; repostCount: number }) => setState({ reposted: result.reposted, count: result.repostCount });
    const onError = (error: Parameters<typeof friendlyError>[0]) => { setState(before); toast.error(friendlyError(error, "Could not update your repost")); };
    if (kind === "track") trackMutation.mutate({ trackId: id, reposted }, { onSuccess, onError });
    else collectionMutation.mutate({ collectionId: id, reposted }, { onSuccess, onError });
  };

  const toggle = () => {
    if (!user) {
      useAuthPrompt.getState().show("Sign in to repost", () => perform(true));
      return;
    }
    perform(!state.reposted);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.reposted}
      aria-label={state.reposted ? `Undo repost of ${kind}` : `Repost ${kind}`}
      disabled={isPrivate && !state.reposted}
      title={isPrivate ? "Private content can't be liked or reposted" : undefined}
      className={cn(className, state.reposted && "border-orange-500/60 text-orange-400")}
    >
      <Repeat2 className={variant === "pill" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {variant === "pill" ? <span>{state.count}</span> : null}
    </button>
  );
}
