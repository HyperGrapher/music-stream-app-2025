"use client";

import { useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/trpc/react";

type Props = Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & { value: string; onValueChange: (value: string) => void };

/** The `@name` being typed right before the caret, if any. */
export function activeMention(value: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|[^a-z0-9_-])@([a-z0-9_-]{0,25})$/i.exec(value.slice(0, caret));
  return match ? { start: caret - match[1]!.length - 1, query: match[1]! } : null;
}

/** A textarea that suggests usernames after `@` (CM-4): people you follow first; arrows + Enter/Tab pick, Escape closes. */
export function MentionTextarea({ value, onValueChange, onKeyDown, ...rest }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const mention = activeMention(value, caret);
  const open = !!mention && dismissed !== mention.start;
  const suggestions = api.search.mentions.useQuery({ q: mention?.query ?? "" }, { enabled: open, placeholderData: (previous) => previous });
  const options = open ? (suggestions.data ?? []) : [];
  const shown = options.length > 0;
  const listId = "mention-options";

  const pick = (username: string) => {
    if (!mention) return;
    const next = `${value.slice(0, mention.start)}@${username} ${value.slice(caret)}`;
    onValueChange(next);
    const position = mention.start + username.length + 2;
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={box}
        value={value}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `mention-${index}` : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          setCaret(event.target.selectionStart);
          setIndex(0);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (shown) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              pick(options[Math.min(index, options.length - 1)]!.username);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDismissed(mention?.start ?? null);
              return;
            }
          }
          onKeyDown?.(event);
        }}
      />
      {shown ? (
        <ul id={listId} role="listbox" aria-label="People to mention" className="absolute z-20 mt-1 w-64 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {options.map((person, i) => (
            <li key={person.id} id={`mention-${i}`} role="option" aria-selected={i === index} onMouseDown={(event) => { event.preventDefault(); pick(person.username); }} className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${i === index ? "bg-orange-500/15 text-white" : "text-zinc-200 hover:bg-zinc-800"}`}>
              <Avatar className="h-6 w-6"><AvatarImage src={person.image ?? ""} alt="" /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1 truncate">{person.name} <span className="text-zinc-400">@{person.username}</span></span>
              {person.following ? <span className="text-[10px] text-zinc-400">Following</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
