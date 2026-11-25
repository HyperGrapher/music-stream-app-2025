"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/hooks/useUser";
import { api } from "@/trpc/react";

/**
 * Like state for one track with optimistic updates: the heart flips immediately, the server's
 * answer (the authoritative count) replaces it, and a failure rolls it back.
 */
export function useTrackLike(trackId: string, initialLiked: boolean, initialCount: number) {
  const { user } = useUser();
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });

  // Follow fresh server data (navigation, router refresh) without an effect: React's
  // supported "adjust state while rendering" pattern.
  const [seen, setSeen] = useState({ initialLiked, initialCount });
  if (seen.initialLiked !== initialLiked || seen.initialCount !== initialCount) {
    setSeen({ initialLiked, initialCount });
    setState({ liked: initialLiked, count: initialCount });
  }

  const mutation = api.engagement.setTrackLike.useMutation();

  const toggle = () => {
    if (!user) {
      toast("Sign in to like tracks");
      return;
    }
    if (mutation.isPending) return;

    const before = state;
    const liked = !before.liked;
    setState({ liked, count: Math.max(0, before.count + (liked ? 1 : -1)) });
    mutation.mutate(
      { trackId, liked },
      {
        onSuccess: (result) => setState({ liked: result.liked, count: result.likeCount }),
        onError: () => {
          setState(before);
          toast.error("Could not update your like");
        },
      },
    );
  };

  return { liked: state.liked, count: state.count, toggle, pending: mutation.isPending };
}
