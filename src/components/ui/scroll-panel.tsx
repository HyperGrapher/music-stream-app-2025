"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A bordered, slightly recessed panel for lists that can be longer than their box. It reads as
 * scrollable: a darker well than the page, and a fade at the bottom edge while more content waits below.
 * Give it a height with `className` (`max-h-72`, `h-full`, ...).
 */
export function ScrollPanel({ className, children, ...rest }: React.ComponentProps<"div">) {
  const viewport = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const measure = useCallback(() => {
    const el = viewport.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  useEffect(() => {
    measure();
    const el = viewport.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/70", className)}>
      <div ref={viewport} onScroll={measure} className="h-full max-h-[inherit] overflow-y-auto p-1.5" {...rest}>
        {children}
      </div>
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950 to-transparent transition-opacity", moreBelow ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
