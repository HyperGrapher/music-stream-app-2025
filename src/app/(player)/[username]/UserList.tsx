"use client";

import Link from "next/link";
import { useState } from "react";

import { FollowButton } from "@/components/FollowButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type RouterOutputs } from "@/trpc/react";

type Page = RouterOutputs["profiles"]["follows"];

/** Followers / following as a grid of user cards (FO-3), paginated; "following" has a filter box. */
export function UserList({ username, direction, initial }: { username: string; direction: "followers" | "following"; initial: Page }) {
  const utils = api.useUtils();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (next: { cursor?: string; q: string }, replace: boolean) => {
    setLoading(true);
    try {
      const page = await utils.profiles.follows.fetch({ username, direction, cursor: next.cursor, q: next.q || undefined });
      setItems((current) => (replace ? page.items : [...current, ...page.items]));
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {direction === "following" && (
        <form
          role="search"
          className="mb-5 max-w-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void load({ q: query }, true);
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter people" aria-label="Filter people" className="border-zinc-700 bg-zinc-900 text-white" />
        </form>
      )}
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-400">
          {direction === "followers" ? "No followers yet." : "Not following anyone yet."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((user) => (
            <li key={user.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <Link href={`/${user.username}`}>
                <Avatar className="h-14 w-14">
                  <AvatarImage src={user.image ?? ""} alt="" />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/${user.username}`} className="block truncate text-sm font-semibold hover:text-orange-400">
                  {user.name}
                </Link>
                <p className="text-xs text-zinc-400">
                  {user.followerCount} followers · {user.trackCount} tracks
                </p>
              </div>
              <FollowButton userId={user.id} initialFollowing={user.followedByMe} size="sm" />
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <div className="py-6 text-center">
          <Button type="button" variant="outline" disabled={loading} onClick={() => void load({ cursor, q: query }, false)} className="border-zinc-700 bg-transparent text-white hover:bg-zinc-800">
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
