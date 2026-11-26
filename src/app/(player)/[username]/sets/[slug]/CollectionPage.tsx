import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { CollectionActions } from "@/app/_components/CollectionActions";
import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { ARTWORK_SIZES } from "@/lib/artwork";
import { genreLabel } from "@/lib/genres";
import { OwnerVisibilityBanner, PublishedBanner } from "@/components/editor/Banners";
import { api } from "@/trpc/server";

export interface CollectionPageParams {
  username: string;
  slug: string;
  secret?: string;
  justSaved?: { status?: string; at?: string };
}

const load = ({ username, slug, secret }: CollectionPageParams) =>
  api.collections
    .byPermalink({ username, slug, secret })
    .catch(() => ({ status: "missing" as const }));

const TYPE_LABEL = { PLAYLIST: "Playlist", ALBUM: "Album", EP: "EP", SINGLE: "Single", COMPILATION: "Compilation" } as const;

export async function collectionMetadata(params: CollectionPageParams): Promise<Metadata> {
  const result = await load(params);
  if (result.status !== "ok") return { title: "Not found" };
  const { collection } = result;
  return {
    title: `${collection.title} by ${collection.owner.name} | Music Stream`,
    description: collection.description?.slice(0, 150) ?? `${TYPE_LABEL[collection.type]} by ${collection.owner.name}.`,
    alternates: { canonical: collection.permalink.replace(/\/s-[^/]+$/, "") },
    robots: collection.viaSecret || collection.visibility !== "PUBLIC" ? { index: false, follow: false } : undefined,
  };
}

function formatTotal(durationMs: number) {
  const minutes = Math.round(durationMs / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/** Album / EP / single / compilation / playlist page (PRD 8.4; M3 completes actions and sidebar). */
export async function CollectionPage(params: CollectionPageParams) {
  const result = await load(params);
  if (result.status === "missing") notFound();
  if (result.status === "redirect") permanentRedirect(result.to);
  const { collection } = result;
  const playable = collection.tracks.flatMap((entry) => (entry.available ? [entry] : []));

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
      <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
        {collection.isOwner && params.justSaved?.status && (
          <PublishedBanner
            kind={collection.isPlaylist ? "playlist" : "album"}
            status={params.justSaved.status}
            path={collection.permalink}
            secretToken={collection.secretToken}
            actions={[
              { label: collection.isPlaylist ? "View playlist" : "View release", href: collection.permalink },
              { label: collection.isPlaylist ? "Edit playlist" : "Edit release", href: `/studio/sets/${collection.id}/edit?return=${encodeURIComponent(collection.permalink)}` },
              { label: "Edit tracks", href: `/studio/sets/${collection.id}/edit?return=${encodeURIComponent(collection.permalink)}` },
              { label: "Upload more", href: "/upload" },
              { label: "Go to profile", href: `/${collection.owner.username}` },
            ]}
          />
        )}
        {collection.isOwner && collection.visibility !== "PUBLIC" && collection.secretToken && (
          <OwnerVisibilityBanner visibility="PRIVATE" path={collection.permalink} secretToken={collection.secretToken} />
        )}
        <header className="flex flex-col gap-6 sm:flex-row">
          <img
            src={collection.artworkUrl ?? "/placeholder-track.jpg"}
            srcSet={collection.artworkSrcSet ?? undefined}
            sizes={ARTWORK_SIZES.hero}
            alt={`${collection.title} artwork`}
            className="aspect-square w-full max-w-[260px] rounded-lg bg-zinc-900 object-cover shadow-2xl"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-orange-500 uppercase">
              {TYPE_LABEL[collection.type]}
            </p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{collection.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              <Link href={`/${collection.owner.username}`} className="font-semibold text-zinc-200 hover:text-orange-400">
                {collection.owner.name}
              </Link>
              {" · "}
              {collection.isPlaylist || !collection.releaseDate
                ? `Created ${format(new Date(collection.createdAt), "d MMM yyyy")}`
                : format(new Date(collection.releaseDate), "d MMM yyyy")}
              {" · "}
              {collection.trackCount} {collection.trackCount === 1 ? "track" : "tracks"}
              {collection.durationMs > 0 && ` · ${formatTotal(collection.durationMs)}`}
            </p>
            <CollectionActions collection={collection} tracks={playable} />
            {collection.isOwner && (
              <p className="mt-3">
                <Link href={`/studio/sets/${collection.id}/edit?return=${encodeURIComponent(collection.permalink)}`} className="rounded-full border border-zinc-700 px-4 py-1.5 text-sm font-semibold hover:border-zinc-400">Edit</Link>
              </p>
            )}
            {collection.genre && <p className="mt-2 text-xs text-zinc-400"># {genreLabel(collection.genre)}</p>}
            {collection.description && (
              <p className="mt-4 max-w-2xl text-sm leading-6 whitespace-pre-line text-zinc-300">{collection.description}</p>
            )}
          </div>
        </header>

        <section className="mt-8" aria-label="Tracks">
          {collection.tracks.map((entry) =>
            entry.available ? (
              <WaveformTrackItem key={entry.id} track={entry} playlist={playable} context={{ name: collection.title, source: "COLLECTION", collectionId: collection.id }} compact />
            ) : (
              <div
                key={entry.id}
                className="border-b border-zinc-900 py-5 text-sm text-zinc-400"
                data-testid="unavailable-track"
              >
                {entry.position + 1}. This track is not available
              </div>
            ),
          )}
        </section>
      </div>
    </div>
  );
}
