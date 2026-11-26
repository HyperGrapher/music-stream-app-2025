"use client";

import { Heart } from "lucide-react";

import { useTrackLike } from "@/hooks/useTrackLike";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  trackId: string;
  /** Owner of the track: creators cannot like their own tracks (VI-2), so they only see the count. */
  creatorId?: string;
  /** Secret-link proof (`PlayerTrack.accessQuery`). */
  access?: string;
  /** Private tracks (reached through a secret link) cannot be liked. */
  isPrivate?: boolean;
  initialLiked?: boolean;
  initialCount?: number;
  /** "pill": compact button with the count inside (lists). "round": icon button, count beside it. */
  variant: "pill" | "round";
  className: string;
}

export function LikeButton({
  trackId,
  creatorId,
  access,
  isPrivate = false,
  initialLiked = false,
  initialCount = 0,
  variant,
  className,
}: LikeButtonProps) {
  const { user } = useUser();
  const { liked, count, toggle } = useTrackLike(trackId, initialLiked, initialCount, access);
  const isOwn = !!creatorId && user?.id === creatorId;
  const heart = cn(variant === "pill" ? "h-3.5 w-3.5" : "h-5 w-5", liked && "fill-current text-orange-500");

  if (isOwn) {
    // The like button is replaced by the plain counter on your own content.
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400" title="Likes">
        <Heart className="h-3.5 w-3.5" /> {count}
      </span>
    );
  }

  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={variant === "pill" ? undefined : liked ? "Unlike track" : "Like track"}
      disabled={isPrivate && !liked}
      title={isPrivate ? "Private tracks can't be liked or reposted" : undefined}
      className={cn(className, liked && "border-orange-500/60 text-orange-400")}
    >
      <Heart className={heart} />
      {variant === "pill" && <><span className="sr-only">{liked ? "Unlike track" : "Like track"}</span><span>{count}</span></>}
    </button>
  );

  if (variant === "pill") return button;
  return (
    <>
      {button}
      <span className="mr-2 text-sm font-semibold text-zinc-300" aria-live="polite">
        {count}
      </span>
    </>
  );
}
