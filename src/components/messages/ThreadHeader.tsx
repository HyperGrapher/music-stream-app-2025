"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { MessagePerson } from "@/server/modules/messages";

/** Who you are talking to: back arrow on phones, avatar and name linking to the profile, and the page's actions. */
export function ThreadHeader({ person, children }: { person: Pick<MessagePerson, "name" | "username" | "image">; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2.5">
      <Link href="/messages" aria-label="Back to conversations" className="rounded-full p-2 text-zinc-300 hover:bg-zinc-800 md:hidden"><ArrowLeft className="h-5 w-5" /></Link>
      <Link href={`/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="h-9 w-9"><AvatarImage src={person.image ?? ""} alt="" /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{person.name}</span>
          <span className="block truncate text-xs text-zinc-400">@{person.username}</span>
        </span>
      </Link>
      {children}
    </header>
  );
}
