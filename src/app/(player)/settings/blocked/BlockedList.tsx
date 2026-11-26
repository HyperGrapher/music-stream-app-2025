"use client";

import Link from "next/link";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/error-messages";
import { api } from "@/trpc/react";

/** `/settings/blocked` (BL-2): the people you blocked, with Unblock. */
export function BlockedList() {
  const utils = api.useUtils();
  const list = api.trust.blocked.useQuery();
  const unblock = api.trust.setBlock.useMutation({
    onSuccess: () => { toast.success("Unblocked"); void utils.trust.blocked.invalidate(); },
    onError: (error) => toast.error(friendlyError(error, "Could not unblock")),
  });
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Blocked people</h1>
      <p className="mb-6 text-sm text-zinc-400">Blocked people can&apos;t follow you or comment on your tracks, and you won&apos;t see their comments. Your public pages stay public.</p>
      {list.isLoading && <p className="text-sm text-zinc-400">Loading...</p>}
      {list.data?.length === 0 && <p className="rounded border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-400">You haven&apos;t blocked anyone.</p>}
      <ul className="max-w-lg space-y-2">
        {(list.data ?? []).map((person) => (
          <li key={person.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="blocked-user">
            <Avatar className="h-10 w-10"><AvatarImage src={person.image ?? ""} alt="" /><AvatarFallback>{person.name.charAt(0)}</AvatarFallback></Avatar>
            <Link href={`/${person.username}`} className="min-w-0 flex-1 truncate font-semibold hover:text-orange-400">{person.name}</Link>
            <Button size="sm" variant="outline" disabled={unblock.isPending} onClick={() => unblock.mutate({ userId: person.id, blocked: false })}>Unblock</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
