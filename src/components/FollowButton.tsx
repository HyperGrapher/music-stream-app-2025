"use client";

import { Check, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";
import { friendlyError } from "@/lib/error-messages";
import { useAuthPrompt } from "@/store/authPrompt";
import { api } from "@/trpc/react";

interface FollowButtonProps {
  userId: string;
  initialFollowing: boolean;
  size?: "sm" | "default";
  /** Called with the target's new follower count after the server answered. */
  onChange?: (following: boolean, followerCount: number) => void;
}

/** Follow / Following toggle with optimistic update and rollback (FO-1). Hidden on your own profile. */
export function FollowButton({ userId, initialFollowing, size = "default", onChange }: FollowButtonProps) {
  const { user } = useUser();
  const [following, setFollowing] = useState(initialFollowing);
  const mutation = api.engagement.setFollow.useMutation();

  // Follow fresh server data without an effect (supported "adjust state while rendering" pattern).
  const [seen, setSeen] = useState(initialFollowing);
  if (seen !== initialFollowing) {
    setSeen(initialFollowing);
    setFollowing(initialFollowing);
  }

  if (user?.id === userId) return null;

  const perform = (follow: boolean) => {
    if (mutation.isPending) return;
    const before = following;
    setFollowing(follow);
    mutation.mutate(
      { userId, follow },
      {
        onSuccess: (result) => {
          setFollowing(result.following);
          onChange?.(result.following, result.followerCount);
        },
        onError: (error) => {
          setFollowing(before);
          toast.error(friendlyError(error, "Could not update your follows"));
        },
      },
    );
  };

  return (
    <Button
      type="button"
      size={size}
      aria-pressed={following}
      variant={following ? "outline" : "default"}
      onClick={() => {
        if (!user) {
          useAuthPrompt.getState().show("Sign in to follow creators", () => perform(true));
          return;
        }
        perform(!following);
      }}
      className={following ? "border-zinc-600 bg-transparent text-white hover:bg-zinc-800" : "bg-white text-black hover:bg-zinc-200"}
    >
      {following ? (
        <>
          <Check className="h-4 w-4" /> Following
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" /> Follow
        </>
      )}
    </Button>
  );
}
