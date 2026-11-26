"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { ConversationList } from "./ConversationList";

/** MS-2: list + thread side by side on desktop; on a phone they are separate screens. */
export function MessagesShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const showThread = pathname !== "/messages" || search.has("to");
  return (
    <div className="mx-auto h-[calc(100dvh-14rem)] min-h-[26rem] max-w-6xl px-0 sm:px-4 sm:py-6 md:h-[calc(100dvh-11rem)]">
      <div className="flex h-full overflow-hidden border-zinc-800 bg-zinc-950 text-white sm:rounded-xl sm:border">
        <div className={cn("h-full w-full shrink-0 border-zinc-800 md:block md:w-80 md:border-r", showThread ? "hidden" : "block")}>
          <ConversationList />
        </div>
        <section className={cn("h-full min-w-0 flex-1 md:block", showThread ? "block" : "hidden")}>{children}</section>
      </div>
    </div>
  );
}
