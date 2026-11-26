import { cn } from "@/lib/utils"

/** A placeholder block: a warm light sweeps across it (no grey pulsing); still when the user prefers reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-md bg-zinc-800/70 after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer-sweep_1.8s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-orange-300/10 after:to-transparent motion-reduce:after:hidden",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
