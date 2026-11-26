"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

/** A titled horizontal row of cards (PRD 10.1): arrows on desktop, swipe/scroll on touch. Callers hide it when empty. */
export function Carousel({ id, title, href, children }: { id: string; title: string; href?: string; children: React.ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * (track.current.clientWidth * 0.85), behavior: "smooth" });
  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id} className="text-xl font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {href ? <Link href={href} className="text-sm font-semibold text-zinc-400 hover:text-white">See all</Link> : null}
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} className="hidden h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 hover:text-white md:flex"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} className="hidden h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 hover:text-white md:flex"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <ul ref={track} className="-mx-1 flex snap-x gap-4 no-scrollbar overflow-x-auto px-1 pb-2">
        {Array.isArray(children) ? children.map((child, i) => <li key={i} className="w-40 shrink-0 snap-start sm:w-44">{child}</li>) : <li className="w-40 shrink-0 snap-start sm:w-44">{children}</li>}
      </ul>
    </section>
  );
}
