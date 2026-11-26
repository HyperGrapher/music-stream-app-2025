"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [["/you/library", "Overview"], ["/you/likes", "Likes"], ["/you/sets", "Playlists"], ["/you/albums", "Albums"], ["/you/following", "Following"], ["/you/history", "History"]] as const;

export function LibraryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Library" className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("rounded-full px-3 py-1.5 text-sm", pathname === href ? "bg-orange-500/15 text-orange-300" : "text-zinc-300 hover:text-white")}>{label}</Link>
      ))}
    </nav>
  );
}
