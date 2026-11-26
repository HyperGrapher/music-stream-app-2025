"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { usePlayerStore } from "@/store/player";
import { cn } from "@/lib/utils";

import { ConversationList } from "./ConversationList";

/** MS-2: list + thread side by side on desktop; on a phone they are separate screens. */
export function MessagesShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const playing = usePlayerStore((state) => state.currentTrack !== null);
  const showThread = pathname !== "/messages" || search.has("to");
  return (
    <div className={cn(
        // Phone: fill exactly the space between the top bar and the fixed bottom bars (tab bar, plus the mini player while a track is loaded);
        // the negative margin cancels the page's bottom padding that is reserved for those bars.
        "mx-auto -mb-32 min-h-72 max-w-6xl px-0 sm:mb-0 sm:h-[calc(100dvh-14rem)] sm:px-4 sm:py-6 md:h-[calc(100dvh-11rem)] md:min-h-[26rem]",
        playing ? "h-[calc(100dvh-3.6rem-3.5rem-3.75rem-env(safe-area-inset-bottom))]" : "h-[calc(100dvh-3.6rem-3.5rem-env(safe-area-inset-bottom))]",
      )}>
      <div className="flex h-full overflow-hidden border-zinc-800 bg-zinc-950 text-white sm:rounded-xl sm:border">
        <div className={cn("h-full w-full shrink-0 border-zinc-800 md:block md:w-80 md:border-r", showThread ? "hidden" : "block")}>
          <ConversationList />
        </div>
        <section className={cn("h-full min-w-0 flex-1 md:block", showThread ? "block" : "hidden")}>{children}</section>
      </div>
    </div>
  );
}
