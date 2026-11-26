"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CollectionCard } from "@/app/_components/CollectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

const FILTERS = [["all", "All"], ["created", "Created"], ["liked", "Liked"]] as const;

/** Playlists (LB-3) or albums (LB-4): created and liked, filter chips; playlists get "+ Create playlist". */
export function LibraryCollections({ kind }: { kind: "playlists" | "albums" }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [offset, setOffset] = useState(0);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const query = api.library.collections.useQuery({ kind, filter, offset });
  const create = api.collections.createPlaylist.useMutation({
    onSuccess: (playlist) => { toast.success(`Created “${playlist.title}”`); router.push(`/studio/sets/${playlist.id}/edit`); },
    onError: (error) => toast.error(friendlyError(error, "Could not create the playlist")),
  });

  const nextOffset = query.data?.nextOffset ?? null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([value, label]) => (
          <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setOffset(0); }} className={cn("rounded-full border px-3 py-1 text-sm", filter === value ? "border-orange-500 bg-orange-500/15 text-orange-300" : "border-zinc-700 text-zinc-300")}>{label}</button>
        ))}
        {kind === "playlists" && (
          <Button size="sm" className="ml-auto bg-orange-700 text-white hover:bg-orange-800" onClick={() => setCreating((v) => !v)}><Plus className="h-4 w-4" /> Create playlist</Button>
        )}
      </div>
      {creating && (
        <form className="mt-4 flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate({ title }); }}>
          <Input aria-label="Playlist title" placeholder="Playlist title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Button type="submit" disabled={!title.trim() || create.isPending}>Create</Button>
        </form>
      )}
      <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {(query.data?.items ?? []).map((item) => (
          <li key={item.id}><CollectionCard collection={item} badge={item.origin === "liked" ? "Liked" : undefined} /></li>
        ))}
      </ul>
      {query.data?.items.length === 0 && <p className="mt-10 text-center text-sm text-zinc-400">{kind === "playlists" ? "No playlists yet." : "No albums yet."}</p>}
      {nextOffset !== null && <div className="mt-6 text-center"><Button variant="outline" className="border-zinc-700 bg-transparent text-white" onClick={() => setOffset(nextOffset)}>Next page</Button></div>}
    </div>
  );
}
