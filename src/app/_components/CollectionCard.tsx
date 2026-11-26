import Link from "next/link";

import { ARTWORK_SIZES } from "@/lib/artwork";

interface CollectionCardProps {
  collection: {
    title: string;
    permalink: string;
    type: string;
    isPlaylist: boolean;
    trackCount: number;
    artworkUrl: string | null;
    artworkSrcSet: string | null;
  };
  /** Small label above the title, e.g. "Reposted". */
  badge?: string;
}

const TYPE_LABEL: Record<string, string> = { PLAYLIST: "Playlist", ALBUM: "Album", EP: "EP", SINGLE: "Single", COMPILATION: "Compilation" };

export function CollectionCard({ collection, badge }: CollectionCardProps) {
  return (
    <Link href={collection.permalink} className="group block min-w-0">
      <div className="aspect-square overflow-hidden rounded-md bg-zinc-900">
        <img
          src={collection.artworkUrl ?? "/placeholder-track.jpg"}
          srcSet={collection.artworkSrcSet ?? undefined}
          sizes={ARTWORK_SIZES.card}
          alt={`${collection.title} artwork`}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </div>
      {badge && <p className="mt-2 text-[11px] font-semibold tracking-wide text-orange-500 uppercase">{badge}</p>}
      <p className={`${badge ? "" : "mt-2 "}truncate text-sm font-semibold group-hover:text-orange-400`}>{collection.title}</p>
      <p className="text-xs text-zinc-400">
        {TYPE_LABEL[collection.type] ?? collection.type} · {collection.trackCount} {collection.trackCount === 1 ? "track" : "tracks"}
      </p>
    </Link>
  );
}
