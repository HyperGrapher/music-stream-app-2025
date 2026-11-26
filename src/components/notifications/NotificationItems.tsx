"use client";

import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { describeNotification } from "@/lib/notification-text";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";

export type NotificationEntry = RouterOutputs["notifications"]["list"]["items"][number];

/** Rows of grouped notifications (NT-5): avatar stack, sentence, time, unread dot. */
export function NotificationItems({ items, onNavigate }: { items: NotificationEntry[]; onNavigate?: () => void }) {
  return (
    <ul>
      {items.map((item) => {
        const href = item.target?.href ?? (item.type === "FOLLOW" && item.actors[0] ? `/${item.actors[0].username}` : "/notifications");
        return (
          <li key={item.key}>
            <Link href={href} onClick={onNavigate} className={cn("flex items-start gap-3 px-3 py-2.5 hover:bg-zinc-800/70", item.unread && "bg-orange-500/5")} data-testid="notification">
              <span className="flex -space-x-2">
                {(item.actors.length ? item.actors : [{ id: "sys", name: "M", image: null }]).slice(0, 3).map((actor) => (
                  <Avatar key={actor.id} className="h-8 w-8 ring-2 ring-zinc-900">
                    <AvatarImage src={actor.image ?? ""} alt="" />
                    <AvatarFallback className="text-xs">{actor.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block text-zinc-100">{describeNotification(item)}</span>
                {item.excerpt ? <span className="block truncate text-xs text-zinc-400">“{item.excerpt}”</span> : null}
                <time className="text-xs text-zinc-400" dateTime={new Date(item.createdAt).toISOString()}>{formatDistanceToNowStrict(new Date(item.createdAt), { addSuffix: true })}</time>
              </span>
              {item.unread ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-700" aria-label="Unread" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
