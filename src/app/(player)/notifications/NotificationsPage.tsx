"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

import { NotificationItems, type NotificationEntry } from "@/components/notifications/NotificationItems";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

const TABS = [["all", "All"], ["likes", "Likes"], ["reposts", "Reposts"], ["comments", "Comments"], ["follows", "Follows"], ["mentions", "Mentions"]] as const;

/** `/notifications` (NT-5): filter tabs, grouped items, "Load more", marks the page read when opened. */
export function NotificationsPage() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<(typeof TABS)[number][0]>("all");
  const [more, setMore] = useState<NotificationEntry[]>([]);
  const [before, setBefore] = useState<Date | null | undefined>(undefined);
  const first = api.notifications.list.useQuery({ filter });
  const markAll = api.notifications.markRead.useMutation({ onSuccess: () => { void utils.notifications.unreadCount.invalidate(); void utils.notifications.list.invalidate(); } });
  const items = [...(first.data?.items ?? []), ...more];
  const next = before === undefined ? first.data?.nextBefore : before;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <Button variant="outline" size="sm" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={() => markAll.mutate({})}>Mark all as read</Button>
      </div>
      <div role="tablist" className="mt-4 flex flex-wrap gap-2">
        {TABS.map(([value, label]) => (
          <button key={value} role="tab" aria-selected={filter === value} onClick={() => { setFilter(value); setMore([]); setBefore(undefined); }} className={cn("rounded-full border px-3 py-1 text-sm", filter === value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300 hover:border-zinc-500")}>{label}</button>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60">
        {first.isLoading ? <div className="space-y-4 p-6" role="status" aria-label="Loading">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-10 w-10" /></div>)}</div> : null}
        {!first.isLoading && items.length === 0 ? <p className="p-6 text-sm text-zinc-400">Nothing here yet.</p> : null}
        <NotificationItems items={items} />
      </div>
      {next ? (
        <div className="mt-4 text-center">
          <Button variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800" onClick={async () => {
            const page = await utils.notifications.list.fetch({ filter, before: next });
            setMore((current) => [...current, ...page.items.filter((i) => !current.some((c) => c.key === i.key) && !first.data?.items.some((c) => c.key === i.key))]);
            setBefore(page.nextBefore);
          }}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}
