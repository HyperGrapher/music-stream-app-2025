import { format } from "date-fns";
import { Heart, MapPin, MessageCircle, Play, Repeat2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrackDetailHero } from "@/app/_components/TrackDetailHero";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api, HydrateClient } from "@/trpc/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const track = await api.artist.getTrack({ trackId: id }).catch(() => null);
  if (!track) return { title: "Track not found" };
  return {
    title: `${track.title} by ${track.user.name}`,
    description: track.description ?? `Listen to ${track.title}.`,
  };
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const track = await api.artist.getTrack({ trackId: id }).catch(() => null);
  if (!track) notFound();
  const release = track.releaseEntries[0]?.release;

  return (
    <HydrateClient>
      <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
          <TrackDetailHero track={track} />

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
                      <dt className="font-semibold">Release:</dt>
                      <dd className="text-zinc-400">{release.title}</dd>
                    </div>
                  )}
                  {track.genre && (
                    <div className="flex gap-2">
                      <dt className="font-semibold">Genre:</dt>
                      <dd className="text-zinc-400">{track.genre}</dd>
                    </div>
                  )}
                </dl>
                {track.description && (
                  <p className="mt-5 text-sm leading-7 whitespace-pre-line text-zinc-300">
                    {track.description}
                  </p>
                )}
                {track.tags.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {track.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                      >
                        # {tag}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h2 className="text-xs font-bold tracking-wide uppercase">
                    {track.commentCount} comments
                  </h2>
                  <span className="text-xs text-zinc-500">Newest</span>
                </div>
                <div className="mt-4 flex items-center gap-4 rounded border border-dashed border-zinc-700 p-5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-zinc-800">
                    <MessageCircle className="h-6 w-6 text-zinc-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Be the first to comment on this track.
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Start a conversation at a specific moment in the waveform.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-600 px-4 py-2 text-sm font-semibold hover:border-zinc-400"
                  >
                    Comment
                  </button>
                </div>
              </section>
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
                      href={`/u/${track.creator.id}`}
                      className="truncate text-lg font-bold hover:text-orange-500"
                    >
                      {track.creator.name}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {track.creator.followersCount} followers ·{" "}
                      {track.creator.trackCount} tracks
                    </p>
                    {track.creator.location && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <MapPin className="h-3 w-3" /> {track.creator.location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-white py-2 text-sm font-bold text-black hover:bg-zinc-200"
                  >
                    Follow
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-zinc-700 py-2 text-sm font-bold hover:border-zinc-500"
                  >
                    Message
                  </button>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.playCount}</p>
                  <p className="mt-1 text-[10px] text-zinc-500 uppercase">
                    <Play className="mr-1 inline h-3 w-3" />
                    Plays
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.likeCount}</p>
                  <p className="mt-1 text-[10px] text-zinc-500 uppercase">
                    <Heart className="mr-1 inline h-3 w-3" />
                    Likes
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-4">
                  <p className="text-xl font-bold">{track.repostCount}</p>
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
