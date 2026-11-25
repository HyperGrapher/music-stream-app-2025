import { formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  Mail,
  MapPin,
  MoreHorizontal,
  Radio,
  Share2,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, HydrateClient } from "@/trpc/server";
import { ARTWORK_SIZES } from "@/lib/artwork";
import type { PlayerTrack } from "@/types/player-track";

const tabClass =
  "h-14 rounded-none border-b-2 border-transparent px-1 text-sm font-semibold text-zinc-500 shadow-none data-[state=active]:border-orange-500 data-[state=active]:bg-transparent data-[state=active]:text-white";
const profileActionClass =
  "inline-flex h-9 items-center gap-2 rounded border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800";

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const result = await api.profiles.byUsername({ username });
  if (result.status !== "ok") return { title: "Creator not found" };
  const { profile } = result;

  return {
    title: `${profile.name} | Music Stream`,
    description:
      profile.bio ?? `Listen to tracks and releases from ${profile.name}.`,
    alternates: { canonical: `/${profile.username}` },
  };
}

const placeholder = (text: string) => (
  <div className="rounded border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">
    {text}
  </div>
);

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const result = await api.profiles.byUsername({ username });
  if (result.status === "missing") notFound();
  if (result.status === "redirect") permanentRedirect(result.to);
  const { profile } = result;

  const [latestTracks, popularTracks, albums, sets] = await Promise.all([
    api.profiles.tracks({ username, sort: "latest", limit: 100 }).catch(() => []),
    api.profiles.tracks({ username, sort: "popular", limit: 5 }).catch(() => []),
    api.profiles.collections({ username, kind: "albums" }).catch(() => []),
    api.profiles.collections({ username, kind: "sets" }).catch(() => []),
  ]);

  const renderTracks = (tracks: PlayerTrack[]) =>
    tracks.length ? (
      <div>
        {tracks.map((track) => (
          <WaveformTrackItem key={track.id} track={track} playlist={tracks} />
        ))}
      </div>
    ) : (
      <div className="rounded border border-dashed border-zinc-800 px-6 py-16 text-center text-sm text-zinc-500">
        No public tracks yet.
      </div>
    );

  const renderCollections = (items: typeof albums, empty: string) =>
    items.length ? (
      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <Link href={item.permalink} className="group block">
              <div className="aspect-square overflow-hidden rounded-md bg-zinc-900">
                <img
                  src={item.artworkUrl ?? "/placeholder-track.jpg"}
                  srcSet={item.artworkSrcSet ?? undefined}
                  sizes={ARTWORK_SIZES.card}
                  alt={`${item.title} artwork`}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
              <p className="mt-2 truncate text-sm font-semibold group-hover:text-orange-400">
                {item.title}
              </p>
              <p className="text-xs text-zinc-500">
                {item.isPlaylist ? "Playlist" : item.type[0] + item.type.slice(1).toLowerCase()} ·{" "}
                {item.trackCount} {item.trackCount === 1 ? "track" : "tracks"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      placeholder(empty)
    );

  return (
    <HydrateClient>
      <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
        <div className="mx-auto max-w-[1240px] border-x border-zinc-900 bg-[#101010]">
          <section className="relative h-[250px] overflow-hidden bg-[radial-gradient(circle_at_72%_36%,#7c2d12_0%,#292524_32%,#09090b_74%)] sm:h-[290px]">
            {profile.bannerUrl && (
              <img
                src={profile.bannerUrl}
                srcSet={profile.bannerSrcSet ?? undefined}
                sizes="(min-width: 1240px) 1240px, 100vw"
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-65"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/15 to-black/25" />
            <div className="absolute inset-x-5 bottom-6 flex items-end gap-5 sm:inset-x-8 sm:bottom-8 sm:gap-7">
              <Avatar className="h-28 w-28 shrink-0 border-4 border-black/30 shadow-2xl sm:h-40 sm:w-40">
                <AvatarImage
                  src={profile.image ?? ""}
                  alt={profile.name}
                />
                <AvatarFallback className="bg-zinc-800 text-4xl font-bold">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="mb-1 min-w-0">
                <h1 className="inline bg-black/80 decoration-clone px-3 py-1 text-2xl leading-[1.55] font-bold sm:text-4xl">
                  {profile.name}
                </h1>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-300">
                  {profile.city && (
                    <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                      <MapPin className="h-3.5 w-3.5" /> {profile.city}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Joined{" "}
                    {formatDistanceToNow(new Date(profile.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <Tabs defaultValue="all">
            <div className="flex min-h-14 items-center justify-between gap-4 border-b border-zinc-800 px-5 sm:px-7">
              <TabsList className="h-14 justify-start gap-5 overflow-x-auto rounded-none bg-transparent p-0 sm:gap-7">
                <TabsTrigger value="all" className={tabClass}>
                  All
                </TabsTrigger>
                <TabsTrigger value="popular" className={tabClass}>
                  Popular tracks
                </TabsTrigger>
                <TabsTrigger value="tracks" className={tabClass}>
                  Tracks
                </TabsTrigger>
                <TabsTrigger value="albums" className={tabClass}>
                  Albums
                </TabsTrigger>
                <TabsTrigger value="playlists" className={tabClass}>
                  Playlists
                </TabsTrigger>
                <TabsTrigger value="reposts" className={tabClass}>
                  Reposts
                </TabsTrigger>
              </TabsList>

              <div className="hidden shrink-0 items-center gap-2 lg:flex">
                <button type="button" className={profileActionClass}>
                  <Radio className="h-4 w-4" /> Station
                </button>
                <button
                  type="button"
                  className={`${profileActionClass} bg-white text-black hover:bg-zinc-200`}
                >
                  <UserPlus className="h-4 w-4" /> Follow
                </button>
                <button type="button" className={profileActionClass}>
                  <Share2 className="h-4 w-4" /> Share
                </button>
                <button
                  type="button"
                  className={profileActionClass}
                  aria-label="Message creator"
                >
                  <Mail className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={profileActionClass}
                  aria-label="More creator actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_290px] lg:px-7">
              <main className="min-w-0">
                <TabsContent value="all" className="mt-0">
                  {renderTracks(latestTracks)}
                </TabsContent>
                <TabsContent value="popular" className="mt-0">
                  {renderTracks(popularTracks)}
                </TabsContent>
                <TabsContent value="tracks" className="mt-0">
                  {renderTracks(latestTracks)}
                </TabsContent>
                <TabsContent value="albums" className="mt-0">
                  {renderCollections(albums, "No public releases yet.")}
                </TabsContent>
                <TabsContent value="playlists" className="mt-0">
                  {renderCollections(sets, "No public playlists yet.")}
                </TabsContent>
                <TabsContent value="reposts" className="mt-0">
                  <div className="rounded border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">
                    No reposts yet.
                  </div>
                </TabsContent>
              </main>

              <aside className="space-y-7 border-t border-zinc-800 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
                <div className="grid grid-cols-3 divide-x divide-zinc-800">
                  <div>
                    <p className="text-xs text-zinc-500">Followers</p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCount(profile.followerCount)}
                    </p>
                  </div>
                  <div className="pl-4">
                    <p className="text-xs text-zinc-500">Following</p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCount(profile.followingCount)}
                    </p>
                  </div>
                  <div className="pl-4">
                    <p className="text-xs text-zinc-500">Tracks</p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCount(profile.publicTrackCount)}
                    </p>
                  </div>
                </div>

                {profile.bio && (
                  <p className="text-sm leading-6 whitespace-pre-line text-zinc-300">
                    {profile.bio}
                  </p>
                )}

                {profile.city && (
                  <p className="flex items-center gap-2 text-sm text-zinc-400">
                    <MapPin className="h-4 w-4" /> {profile.city}
                  </p>
                )}
              </aside>
            </div>
          </Tabs>
        </div>
      </div>
    </HydrateClient>
  );
}
