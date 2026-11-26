"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

/** MS-2: avatar, name, preview of the last message, time and an unread dot. Refreshed every 30 s while the tab is visible. */
export function ConversationList() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const list = api.messages.conversations.useQuery(undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });

  return (
    <nav aria-label="Conversations" className="flex h-full flex-col">
      <h1 className="border-b border-zinc-800 px-4 py-3 text-lg font-bold">Messages</h1>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isLoading ? (
          <div className="space-y-4 p-4" role="status" aria-label="Loading">
            {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>)}
          </div>
        ) : null}
        {list.data?.length === 0 ? <p className="p-4 text-sm text-zinc-400">No conversations yet. Open someone&apos;s profile and choose Message to start one.</p> : null}
        <ul>
          {list.data?.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                aria-current={conversationId === c.id ? "page" : undefined}
                className={cn("flex items-center gap-3 border-b border-zinc-900 px-4 py-3 hover:bg-zinc-900", conversationId === c.id && "bg-zinc-900")}
              >
                <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={c.other.image ?? ""} alt="" /><AvatarFallback>{c.other.name.charAt(0)}</AvatarFallback></Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread > 0 ? "font-bold text-white" : "font-medium text-zinc-200")}>{c.other.name}</span>
                    <time dateTime={new Date(c.last.at).toISOString()} className="shrink-0 text-xs text-zinc-400">{formatDistanceToNowStrict(new Date(c.last.at))}</time>
                  </span>
                  <span className={cn("block truncate text-sm", c.unread > 0 ? "text-zinc-100" : "text-zinc-400")}>{c.last.mine ? "You: " : ""}{c.last.body}</span>
                </span>
                {c.unread > 0 ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500"><span className="sr-only">{c.unread} unread</span></span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
