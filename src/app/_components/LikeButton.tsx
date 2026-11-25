"use client";

import { Heart } from "lucide-react";

import { useTrackLike } from "@/hooks/useTrackLike";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  trackId: string;
  initialLiked?: boolean;
  initialCount?: number;
  /** "pill": compact button with the count inside (lists). "round": icon button, count beside it. */
  variant: "pill" | "round";
  className: string;
}

export function LikeButton({
  trackId,
  initialLiked = false,
  initialCount = 0,
  variant,
  className,
}: LikeButtonProps) {
  const { liked, count, toggle } = useTrackLike(trackId, initialLiked, initialCount);
  const heart = cn(variant === "pill" ? "h-3.5 w-3.5" : "h-5 w-5", liked && "fill-current text-orange-500");

  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike track" : "Like track"}
      className={cn(className, liked && "border-orange-500/60 text-orange-400")}
    >
      <Heart className={heart} />
      {variant === "pill" && <span>{count}</span>}
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
