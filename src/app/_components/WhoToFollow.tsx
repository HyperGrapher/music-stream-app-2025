import Link from "next/link";

import { FollowButton } from "@/components/FollowButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/trpc/server";

/** "Who to follow" (PRD FO-4): creators followed by people you follow, then popular ones. Signed-in users only. */
export async function WhoToFollow({ limit = 6 }: { limit?: number }) {
  const suggestions = await api.profiles.suggestions({ limit }).catch(() => []);
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="who-to-follow">
      <h2 id="who-to-follow" className="mb-4 text-xl font-bold">
        Who to follow
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((creator) => (
          <li key={creator.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <Link href={`/${creator.username}`}>
              <Avatar className="h-12 w-12">
                <AvatarImage src={creator.image ?? ""} alt="" />
                <AvatarFallback>{creator.name.charAt(0)}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/${creator.username}`} className="block truncate text-sm font-semibold hover:text-orange-400">
                {creator.name}
              </Link>
              <p className="text-xs text-zinc-400">{creator.followerCount} followers</p>
            </div>
            <FollowButton userId={creator.id} initialFollowing={false} size="sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}
