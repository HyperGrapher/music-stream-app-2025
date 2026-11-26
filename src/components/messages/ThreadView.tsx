"use client";

import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { startReport } from "@/components/player/ReportDialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/error-messages";
import { cannotSendText } from "@/lib/message-links";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";

import { Composer } from "./Composer";
import { MessageCard } from "./MessageCard";
import { MessageText } from "./MessageText";
import { ThreadHeader } from "./ThreadHeader";

type Message = RouterOutputs["messages"]["thread"]["messages"][number];

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

/** One conversation (MS-2, MS-5, MS-6): polled every 10 s while the tab is visible, marked read as you look at it. */
export function ThreadView({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const thread = api.messages.thread.useQuery({ conversationId }, { refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: false });
  const [older, setOlder] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(thread.data?.messages ?? [])].filter((m) => !seen.has(m.id) && seen.add(m.id));
  }, [older, thread.data]);
  const cursor = olderCursor === undefined ? thread.data?.nextBefore : olderCursor;

  const refreshLists = useCallback(() => {
    void utils.messages.conversations.invalidate();
    void utils.messages.unreadCount.invalidate();
  }, [utils]);

  // Reading the thread marks it read (and again whenever something new from them arrives while it is open).
  const markRead = api.messages.markRead.useMutation({ onSuccess: refreshLists });
  const { mutate: markReadMutate } = markRead;
  const lastFromThem = messages.filter((m) => !m.mine && !m.removed).at(-1)?.id;
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!lastFromThem || marked.current === lastFromThem) return;
    marked.current = lastFromThem;
    markReadMutate({ conversationId });
  }, [lastFromThem, conversationId, markReadMutate]);

  // Stay at the bottom while new messages come in; keep the place when older ones are added on top.
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop += el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, messages.length]);

  const loadOlder = async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await utils.messages.thread.fetch({ conversationId, before: cursor });
      restoreFrom.current = scroller.current?.scrollHeight ?? null;
      setOlder((current) => [...page.messages, ...current]);
      setOlderCursor(page.nextBefore);
    } catch (error) {
      toast.error(friendlyError(error as never, "Could not load earlier messages"));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = api.messages.send.useMutation({ onError: (error) => toast.error(friendlyError(error, "Could not send the message")) });
  const hide = api.messages.hide.useMutation({
    onSuccess: () => {
      toast.success("Conversation deleted");
      refreshLists();
      router.push("/messages");
    },
    onError: (error) => toast.error(friendlyError(error, "Could not delete the conversation")),
  });
  const block = api.trust.setBlock.useMutation({
    onSuccess: () => {
      toast.success("Blocked");
      void utils.trust.blocked.invalidate();
      refreshLists();
      router.push("/messages");
    },
    onError: (error) => toast.error(friendlyError(error, "Could not block")),
  });

  if (thread.error) {
    return (
      <div className="p-6 text-sm text-zinc-400">
        This conversation isn&apos;t available. <Link href="/messages" className="text-orange-400 underline">Back to messages</Link>
      </div>
    );
  }
  if (!thread.data) {
    return (
      <div className="space-y-4 p-4" role="status" aria-label="Loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="ml-auto h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    );
  }

  const { other } = thread.data;
  return (
    <div className="flex h-full flex-col">
      <ThreadHeader person={other}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-zinc-800" aria-label={`Conversation actions for ${other.name}`}><MoreHorizontal className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link href={`/${other.username}`}>View profile</Link></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { if (window.confirm("Delete this conversation? It disappears for you only.")) hide.mutate({ conversationId }); }}>Delete conversation</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => { if (window.confirm(`Block ${other.name}? They won't be able to message you.`)) block.mutate({ userId: other.id, blocked: true }); }}>Block {other.name}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ThreadHeader>

      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {cursor ? (
          <div className="mb-3 text-center">
            <Button variant="outline" size="sm" className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800" disabled={loadingOlder} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load earlier messages"}</Button>
          </div>
        ) : null}
        {messages.length === 0 ? <p className="py-10 text-center text-sm text-zinc-400">No messages yet. Say hello to {other.name}.</p> : null}
        <ol aria-label={`Messages with ${other.name}`} className="mx-auto flex max-w-3xl flex-col">
          {messages.map((m, i) => {
            const previous = messages[i - 1];
            const at = new Date(m.at);
            const newDay = !previous || !isSameDay(new Date(previous.at), at);
            // Messages from the same person within 5 minutes sit closer together; a change of speaker gets more air.
            const grouped = !newDay && previous.mine === m.mine && at.getTime() - new Date(previous.at).getTime() < 5 * 60_000;
            return (
              <li key={m.id} className={cn(grouped ? "mt-1" : "mt-4", i === 0 && "mt-0")}>
                {newDay ? <p className="mt-2 mb-4 text-center text-xs font-medium text-zinc-400">{dayLabel(at)}</p> : null}
                <div className={cn("group flex items-start gap-1", m.mine ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn("flex max-w-[85%] flex-col sm:max-w-[75%]", m.mine ? "items-end" : "items-start")}>
                    <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words", m.mine ? "rounded-br-md bg-orange-700 text-white" : "rounded-bl-md bg-zinc-800 text-zinc-100")}>
                      {m.removed ? <p className="text-zinc-300 italic">Message removed</p> : <MessageText body={m.body} />}
                      {m.cards.map((card) => <MessageCard key={card.url} card={card} />)}
                    </div>
                    <time dateTime={at.toISOString()} className="mt-1 px-1 text-[11px] text-zinc-400">{format(at, "p")}</time>
                  </div>
                  {!m.mine && !m.removed ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Message actions" className="mt-2 rounded-full p-1 text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-white focus-visible:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => startReport(true, { targetType: "MESSAGE", targetId: m.id, label: "this message" })}>Report message</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <Composer
        pending={send.isPending}
        disabledReason={thread.data.canSend ? null : cannotSendText(thread.data.cannotSendReason, other.name)}
        onSend={(body, clear) =>
          send.mutate({ conversationId, body }, {
            onSuccess: () => {
              clear();
              stickToBottom.current = true;
              void thread.refetch();
              refreshLists();
            },
          })
        }
      />
    </div>
  );
}
