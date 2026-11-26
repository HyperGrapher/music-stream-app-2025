"use client";

import { Compass, Home, Library, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

/** Bottom navigation on phones: the four places people go (PRD mobile). Hidden from `sm` up, where the navbar does it. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useUser();
  if (pathname.startsWith("/upload")) return null;
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/upload", label: "Upload", icon: Upload },
    { href: user?.username ? `/${user.username}` : "/signin", label: user ? "You" : "Sign in", icon: Library },
  ];
  return (
    <nav aria-label="Main" className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex h-[calc(56px+env(safe-area-inset-bottom))] items-start border-t border-[#282828] bg-[#181818] pb-[env(safe-area-inset-bottom)]">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-orange-500" : "text-gray-400")}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
