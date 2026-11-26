import { Skeleton } from "@/components/ui/skeleton";

/** Fixed pseudo-random heights, so the server and client render the same bars. */
const BARS = [30, 55, 40, 75, 60, 90, 45, 70, 35, 80, 50, 95, 65, 40, 85, 55, 30, 70, 45, 60, 90, 35, 75, 50, 40, 65, 85, 55, 30, 60, 45, 80];

/** What a feed (or any list of tracks) looks like while loading: a header line, artwork, titles and a waveform. */
export function FeedSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-8" data-testid="feed-skeleton">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4">
          <Skeleton className="h-28 w-28 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-5 w-2/3" />
            <div className="flex h-12 items-end gap-[3px]">
              {BARS.map((height, i) => (
                <Skeleton key={i} className="w-full rounded-sm" style={{ height: `${((height + row * 13) % 70) + 25}%` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
