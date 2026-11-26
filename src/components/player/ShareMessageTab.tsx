"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollPanel } from "@/components/ui/scroll-panel";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

interface Person { id: string; name: string; username: string; image: string | null }

/** SH-1 "Message" tab: send the link to a conversation you already have, or to someone you search for. */
export function ShareMessageTab({ url }: { url: string }) {
  const utils = api.useUtils();
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const conversations = api.messages.conversations.useQuery();
  const found = api.search.suggest.useQuery({ q: query }, { enabled: query.trim().length >= 2 });
  const send = api.messages.send.useMutation({ onError: (error) => toast.error(friendlyError(error, "Could not send the message")) });

  const body = `${note.trim() ? `${note.trim()}\n` : ""}${url}`;
  const deliver = (key: string, target: { conversationId: string } | { toUserId: string }, name: string) =>
    send.mutate({ ...target, body }, {
      onSuccess: () => {
        setSent((current) => new Set(current).add(key));
        toast.success(`Sent to ${name}`);
        void utils.messages.conversations.invalidate();
      },
    });

  const people: Person[] = query.trim().length >= 2 ? ((found.data?.people ?? [])) : [];
  const row = (key: string, person: Person, target: { conversationId: string } | { toUserId: string }) => (
    <li key={key} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/70">
      <Avatar className="h-8 w-8"><AvatarImage src={person.image ?? ""} alt="" /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar>
      <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
      <Button size="sm" variant={sent.has(key) ? "secondary" : "outline"} disabled={send.isPending || sent.has(key)} aria-label={`${sent.has(key) ? "Sent to" : "Send to"} ${person.name}`} onClick={() => deliver(key, target, person.name)}>
        {sent.has(key) ? <><Check className="h-3.5 w-3.5" /> Sent</> : <><Send className="h-3.5 w-3.5" /> Send</>}
      </Button>
    </li>
  );

  return (
    <div className="space-y-3">
      <Input aria-label="Add a note" placeholder="Add a note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      <Input aria-label="Find a person" placeholder="Find a person" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ScrollPanel className="h-44">
        <ul aria-label={query.trim().length >= 2 ? "People" : "Recent conversations"} className="space-y-1">
          {query.trim().length >= 2
            ? [
                ...people.map((p) => row(`u:${p.id}`, p, { toUserId: p.id })),
                ...(found.isLoading ? [<li key="l" className="px-2 py-1.5 text-sm text-zinc-400">Searching…</li>] : []),
                ...(!found.isLoading && people.length === 0 ? [<li key="n" className="px-2 py-1.5 text-sm text-zinc-400">No one found.</li>] : []),
              ]
            : [
                ...(conversations.data ?? []).map((c) => row(`c:${c.id}`, c.other, { conversationId: c.id })),
                ...(!conversations.isLoading && (conversations.data?.length ?? 0) === 0 ? [<li key="e" className="px-2 py-1.5 text-sm text-zinc-400">No conversations yet. Find a person above.</li>] : []),
              ]}
        </ul>
      </ScrollPanel>
    </div>
  );
}
