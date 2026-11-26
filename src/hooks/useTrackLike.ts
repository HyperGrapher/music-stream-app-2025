"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/hooks/useUser";
import { parseAccessQuery } from "@/lib/access-client";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { api } from "@/trpc/react";

/**
 * Like state for one track with optimistic updates: the heart flips immediately, the server's
 * answer (the authoritative count) replaces it, and a failure rolls it back.
 */
export function useTrackLike(trackId: string, initialLiked: boolean, initialCount: number, accessQuery?: string) {
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

  const perform = (liked: boolean) => {
    if (mutation.isPending) return;
    const before = state;
    setState({ liked, count: Math.max(0, before.count + (liked === before.liked ? 0 : liked ? 1 : -1)) });
    mutation.mutate(
      { trackId, liked, access: parseAccessQuery(accessQuery) },
      {
        onSuccess: (result) => setState({ liked: result.liked, count: result.likeCount }),
        onError: (error) => {
          setState(before);
          toast.error(friendlyError(error, "Could not update your like"));
        },
      },
    );
  };

  const toggle = () => {
    if (!user) {
      // The like the visitor clicked is retried once after they sign in (AU-2).
      useAuthPrompt.getState().show("Sign in to like tracks", () => perform(true));
      return;
    }
    perform(!state.liked);
  };

  return { liked: state.liked, count: state.count, toggle, pending: mutation.isPending };
}
