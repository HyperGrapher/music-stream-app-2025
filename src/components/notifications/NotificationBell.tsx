"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";

import { NotificationItems } from "./NotificationItems";

/** Bell with unread badge (99+), polled every 60 s while the tab is visible (NT-5, NT-6). Opening marks what it shows as read after 2 s. */
export function NotificationBell() {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const count = api.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const list = api.notifications.list.useQuery({ limit: 10 }, { enabled: open });
  const markRead = api.notifications.markRead.useMutation({ onSuccess: () => void utils.notifications.unreadCount.invalidate() });
  const markedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !list.data) return;
    const unread = list.data.items.flatMap((i) => (i.unread ? i.ids : []));
    const signature = unread.join(",");
    if (unread.length === 0 || markedFor.current === signature) return;
    markedFor.current = signature;
    const timer = setTimeout(() => markRead.mutate({ ids: unread }), 2000);
    return () => clearTimeout(timer);
  }, [open, list.data, markRead]);

  const unread = count.data ?? 0;
  return (
    <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (!next) { markedFor.current = null; void utils.notifications.list.invalidate(); } }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full hover:bg-gray-800" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell className="h-5 w-5" />
          {unread > 0 ? <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-orange-700 px-1 text-[10px] leading-4 font-bold text-white" data-testid="unread-badge">{unread > 99 ? "99+" : unread}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => markRead.mutate({})}>Mark all as read</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.isLoading ? <p className="p-4 text-sm text-zinc-400">Loading…</p> : null}
          {list.data?.items.length === 0 ? <p className="p-4 text-sm text-zinc-400">Nothing yet. Likes, reposts, comments and new followers show up here.</p> : null}
          {list.data ? <NotificationItems items={list.data.items} onNavigate={() => setOpen(false)} /> : null}
        </div>
        <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-zinc-800 px-3 py-2 text-center text-sm text-orange-400 hover:bg-zinc-800">View all</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
