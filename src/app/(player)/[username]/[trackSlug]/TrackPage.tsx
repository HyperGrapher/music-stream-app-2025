import { format } from "date-fns";
import { Heart, MapPin, Play, Repeat2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { CommentsSection } from "@/app/_components/CommentsSection";
import { TrackDetailHero } from "@/app/_components/TrackDetailHero";
import { RelatedTracks } from "@/app/_components/RelatedTracks";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { genreLabel } from "@/lib/genres";
import { OwnerVisibilityBanner, PublishedBanner } from "@/components/editor/Banners";
import { api, HydrateClient } from "@/trpc/server";

export interface TrackPageParams {
  username: string;
  slug: string;
  /** Secret link token without the `s-` prefix. */
  secret?: string;
  /** `?new=` / `?at=` after saving from the upload or edit flow (owner only). */
  justSaved?: { status?: string; at?: string };
}

async function loadTrack({ username, slug, secret }: TrackPageParams) {
  return api.tracks.byPermalink({ username, slug, secret }).catch(() => ({ status: "missing" as const }));
}

export async function trackMetadata(params: TrackPageParams): Promise<Metadata> {
  const result = await loadTrack(params);
  if (result.status !== "ok") return { title: "Track not found" };
  const { track } = result;
  const artist = track.artistName ?? track.user?.name ?? "";
  return {
    title: `${track.title} by ${artist} | Music Stream`,
    description: track.description?.slice(0, 150) ?? `Listen to ${track.title} by ${artist}.`,
    alternates: { canonical: track.permalink.replace(/\/s-[^/]+$/, "") },
    // Hidden content must never be indexed, even when reached through its secret link.
    robots: track.viaSecret || track.visibility !== "PUBLIC" ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "music.song",
      title: track.title,
      description: `Listen to ${track.title} by ${artist}.`,
      images: track.artworkUrl ? [track.artworkUrl] : undefined,
    },
    twitter: { card: "summary_large_image", title: track.title, description: `Listen to ${track.title} by ${artist}.`, images: track.artworkUrl ? [track.artworkUrl] : undefined },
  };
}

const LICENSE_LABEL: Record<string, string> = {
  ALL_RIGHTS_RESERVED: "All rights reserved",
  CC_BY: "CC BY",
  CC_BY_SA: "CC BY-SA",
  CC_BY_NC: "CC BY-NC",
  CC_BY_NC_SA: "CC BY-NC-SA",
  CC_BY_ND: "CC BY-ND",
  CC_BY_NC_ND: "CC BY-NC-ND",
  CC0: "CC0 (public domain)",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold">{label}:</dt>
      <dd className="text-zinc-400">{value}</dd>
    </div>
  );
}

export async function TrackPage(params: TrackPageParams) {
  const result = await loadTrack(params);
  if (result.status === "missing") notFound();
  if (result.status === "redirect") permanentRedirect(result.to);
  const { track } = result;
  // Hydrated into the client query: no loading flash. The input must match the client's.
  await api.comments.list
    .prefetch({ trackId: track.id, access: params.secret ? { secret: params.secret } : undefined })
    .catch(() => undefined);
  const release = track.collections.find((collection) => collection.isRelease) ?? track.collections[0];

  const jsonLd =
    track.visibility === "PUBLIC" && !track.viaSecret
      ? {
          "@context": "https://schema.org",
          "@type": "MusicRecording",
          name: track.title,
          byArtist: { "@type": "MusicGroup", name: track.artistName ?? track.creator.name, url: `/${track.creator.username}` },
          duration: `PT${Math.floor(track.duration / 60)}M${track.duration % 60}S`,
          genre: track.genre ?? undefined,
          image: track.artworkUrl ?? undefined,
          url: track.permalink,
          ...(track.isrc ? { isrcCode: track.isrc } : {}),
        }
      : null;

  return (
    <HydrateClient>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /> : null}
      <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
          {track.isOwner && params.justSaved?.status && (
            <PublishedBanner
              kind="track"
              status={params.justSaved.status}
              at={params.justSaved.at}
              path={track.permalink}
              secretToken={track.secretToken}
              actions={[
                { label: "Edit", href: `/studio/tracks/${track.id}/edit?return=${encodeURIComponent(track.permalink)}` },
                { label: "Upload another", href: "/upload" },
                { label: "Go to profile", href: `/${track.creator.username}` },
              ]}
            />
          )}
          {track.isOwner && track.visibility !== "PUBLIC" && track.secretToken && (
            <OwnerVisibilityBanner visibility={track.visibility} publishAt={track.publishAt} path={track.permalink} secretToken={track.secretToken} />
          )}
          <TrackDetailHero track={track} editHref={track.isOwner ? `/studio/tracks/${track.id}/edit?return=${encodeURIComponent(track.permalink)}` : undefined} />

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <main className="min-w-0 space-y-9">
              <section>
                <h2 className="border-b border-zinc-800 pb-3 text-xs font-bold tracking-wide uppercase">
                  Details
                </h2>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  {track.recordLabel && (
                    <div className="flex gap-2">
                      <dt className="font-semibold">Record label:</dt>
                      <dd className="text-zinc-400">{track.recordLabel}</dd>
                    </div>
                  )}
                  {track.releaseDate && (
                    <div className="flex gap-2">
                      <dt className="font-semibold">Release date:</dt>
                      <dd className="text-zinc-400">
                        {format(new Date(track.releaseDate), "d MMMM yyyy")}
                      </dd>
                    </div>
                  )}
                  {release && (
                    <div className="flex gap-2">
                      <dt className="font-semibold">{release.isRelease ? "Release" : "Playlist"}:</dt>
                      <dd className="text-zinc-400">
                        <Link href={release.permalink} className="hover:text-orange-400">
                          {release.title}
                        </Link>
                      </dd>
                    </div>
                  )}
                  {track.bpm ? <Detail label="BPM" value={String(track.bpm)} /> : null}
                  {track.musicalKey ? <Detail label="Key" value={track.musicalKey} /> : null}
                  {track.isrc ? <Detail label="ISRC" value={track.isrc} /> : null}
                  {track.publisher ? <Detail label="Publisher" value={track.publisher} /> : null}
                  {track.license ? <Detail label="License" value={LICENSE_LABEL[track.license] ?? track.license} /> : null}
                  {track.genre && (
                    <div className="flex gap-2">
                      <dt className="font-semibold">Genre:</dt>
                      <dd className="text-zinc-400">{genreLabel(track.genre)}</dd>
                    </div>
                  )}
                </dl>
                {track.collections.length > 0 && (
                  <p className="mt-5 text-sm text-zinc-400">
                    In:{" "}
                    {track.collections.map((collection, index) => (
                      <span key={collection.id}>
                        {index > 0 ? ", " : ""}
                        <Link href={collection.permalink} className="text-zinc-200 hover:text-orange-400">{collection.title}</Link>
                      </span>
                    ))}
                  </p>
                )}
                {track.buyUrl && (
                  <a href={track.buyUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-5 inline-flex rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-zinc-500">
                    {track.buyTitle ?? "Buy"}
                  </a>
                )}
                {track.description && (
                  <p className="mt-5 text-sm leading-7 whitespace-pre-line text-zinc-300">
                    {track.description}
                  </p>
                )}
                {(track.tags?.length ?? 0) > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {track.tags?.map((tag: string) => (
                      <Link
                        key={tag}
                        href={`/tags/${encodeURIComponent(tag)}`}
                        className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        # {tag}
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <CommentsSection track={track} />
            </main>

            <aside className="space-y-3">
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage
                      src={track.creator.image ?? ""}
                      alt={track.creator.name}
                    />
                    <AvatarFallback>
                      {track.creator.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <Link
                      href={`/${track.creator.username}`}
                      className="truncate text-lg font-bold hover:text-orange-500"
                    >
                      {track.creator.name}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {track.creator.followersCount} followers ·{" "}
                      {track.creator.trackCount} tracks
                    </p>
                    {track.creator.city && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <MapPin className="h-3 w-3" /> {track.creator.city}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-5">
                  {!track.isOwner && <FollowButton userId={track.creator.id} initialFollowing={track.creator.followedByMe} />}
                </div>
              </section>

              <RelatedTracks trackId={track.id} />

              <section className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.playCount ?? 0}</p>
                  <p className="mt-1 text-[10px] text-zinc-500 uppercase">
                    <Play className="mr-1 inline h-3 w-3" />
                    Plays
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.likeCount ?? 0}</p>
                  <p className="mt-1 text-[10px] text-zinc-500 uppercase">
                    <Heart className="mr-1 inline h-3 w-3" />
                    Likes
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.repostCount ?? 0}</p>
                  <p className="mt-1 text-[10px] text-zinc-500 uppercase">
                    <Repeat2 className="mr-1 inline h-3 w-3" />
                    Reposts
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </HydrateClient>
  );
}
