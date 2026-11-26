"use client";

import { Send } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MESSAGE_MAX } from "@/lib/message-links";

/** The message box (MS-2): Enter sends, Shift+Enter adds a line, 2 000 characters at most. */
export function Composer({ onSend, pending, disabledReason, autoFocus = false }: { onSend: (body: string, clear: () => void) => void; pending: boolean; disabledReason?: string | null; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooLong = text.length > MESSAGE_MAX;

  const submit = () => {
    if (!trimmed || tooLong || pending || disabledReason) return;
    onSend(trimmed, () => {
      setText("");
      box.current?.focus();
    });
  };

  if (disabledReason) {
    return <p role="status" className="border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">{disabledReason}</p>;
  }
  return (
    <form
      className="border-t border-zinc-800 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={text}
          autoFocus={autoFocus}
          rows={1}
          aria-label="Message"
          placeholder="Write a message…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none"
          style={{ fieldSizing: "content" }}
        />
        <Button type="submit" size="icon" className="h-10 w-10 shrink-0 bg-orange-700 text-white hover:bg-orange-800" disabled={!trimmed || tooLong || pending}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send message</span>
        </Button>
      </div>
      {text.length > MESSAGE_MAX - 200 ? <p className={`mt-1 text-right text-xs ${tooLong ? "text-red-400" : "text-zinc-400"}`}>{text.length} / {MESSAGE_MAX}</p> : null}
    </form>
  );
}
