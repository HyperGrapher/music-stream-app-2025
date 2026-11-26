"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [["/studio/tracks", "Tracks"], ["/studio/sets", "Albums & playlists"], ["/studio/insights", "Insights"], ["/studio/spotlight", "Spotlight"]] as const;

export function StudioNav() {
  const pathname = usePathname();
  if (pathname.endsWith("/edit")) return null; // editors have their own header
  return (
    <nav aria-label="Studio" className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
      <span className="mr-3 py-1.5 text-sm font-bold text-orange-500">Studio</span>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("rounded-full px-3 py-1.5 text-sm", pathname === href ? "bg-orange-500/15 text-orange-300" : "text-zinc-300 hover:text-white")}>{label}</Link>
      ))}
    </nav>
  );
}
