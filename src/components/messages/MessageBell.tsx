"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";

/** Navbar messages icon with the unread-conversation badge, polled with the notification bell (MS-5). */
export function MessageBell() {
  const count = api.messages.unreadCount.useQuery(undefined, { refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
  const unread = count.data ?? 0;
  return (
    <Button asChild variant="ghost" size="icon" className="relative rounded-full hover:bg-zinc-800">
      <Link href="/messages" aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}>
        <MessageSquare className="h-5 w-5" />
        {unread > 0 ? <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-orange-700 px-1 text-[10px] leading-4 font-bold text-white" data-testid="message-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </Link>
    </Button>
  );
}
