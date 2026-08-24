import { formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  Link as LinkIcon,
  Mail,
  MapPin,
  MoreHorizontal,
  Radio,
  Share2,
  UserPlus,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, HydrateClient } from "@/trpc/server";
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
  params: Promise<{ artist: string }>;
}): Promise<Metadata> {
  const { artist } = await params;
  const artistData = await api.artist.getArtist({ artist });
  if (!artistData) return { title: "Creator not found" };

  return {
    title: `${artistData.name} | Music Player`,
    description:
      artistData.bio ??
      `Listen to tracks and releases from ${artistData.name}.`,
  };
}

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ artist: string }>;
}) {
  const { artist } = await params;
  const artistData = await api.artist.getArtist({ artist });
  if (!artistData) notFound();

  const [latestTracks, popularTracks, releases] = await Promise.all([
    api.artist.getLatestTracks({ artist, limit: 100 }).catch(() => []),
    api.artist.getPopularTracks({ artist, limit: 5 }).catch(() => []),
    api.artist.getReleases({ artist }).catch(() => []),
  ]);

  const addCreator = <T extends { id: string }>(track: T) => ({
    ...track,
    userId: artistData.id,
    user: { name: artistData.name, image: artistData.image },
  });
  const latestPlaylist = latestTracks.map(addCreator);
  const popularPlaylist = popularTracks.map(addCreator);

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

  return (
    <HydrateClient>
      <div className="min-h-screen bg-[#0d0d0d] pb-24 text-white">
        <div className="mx-auto max-w-[1240px] border-x border-zinc-900 bg-[#101010]">
          <section className="relative h-[250px] overflow-hidden bg-[radial-gradient(circle_at_72%_36%,#7c2d12_0%,#292524_32%,#09090b_74%)] sm:h-[290px]">
            {artistData.profileImage && (
              <img
                src={artistData.profileImage}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-65"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/15 to-black/25" />
            <div className="absolute inset-x-5 bottom-6 flex items-end gap-5 sm:inset-x-8 sm:bottom-8 sm:gap-7">
              <Avatar className="h-28 w-28 shrink-0 border-4 border-black/30 shadow-2xl sm:h-40 sm:w-40">
                <AvatarImage
                  src={artistData.image ?? ""}
                  alt={artistData.name}
                />
                <AvatarFallback className="bg-zinc-800 text-4xl font-bold">
                  {artistData.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="mb-1 min-w-0">
                <h1 className="inline bg-black/80 decoration-clone px-3 py-1 text-2xl leading-[1.55] font-bold sm:text-4xl">
                  {artistData.name}
                </h1>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-300">
                  {artistData.location && (
                    <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                      <MapPin className="h-3.5 w-3.5" /> {artistData.location}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 bg-black/70 px-2 py-1">
                    <CalendarDays className="h-3.5 w-3.5" /> Joined{" "}
                    {formatDistanceToNow(new Date(artistData.createdAt), {
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
                  {renderTracks(latestPlaylist)}
                </TabsContent>
                <TabsContent value="popular" className="mt-0">
                  {renderTracks(popularPlaylist)}
                </TabsContent>
                <TabsContent value="tracks" className="mt-0">
                  {renderTracks(latestPlaylist)}
                </TabsContent>
                <TabsContent value="albums" className="mt-0 space-y-9">
                  {releases.length ? (
                    releases.map((release) => (
                      <section key={release.id}>
                        <div className="mb-3 flex items-end justify-between border-b border-zinc-800 pb-3">
                          <div>
                            <p className="text-xs font-semibold tracking-widest text-orange-500 uppercase">
                              {release.type}
                            </p>
                            <h2 className="mt-1 text-xl font-bold">
                              {release.title}
                            </h2>
                          </div>
                          <span className="text-xs text-zinc-500">
                            {release.tracks.length} tracks
                          </span>
                        </div>
                        {release.tracks.map((track) => (
                          <WaveformTrackItem
                            key={track.id}
                            track={track}
                            playlist={release.tracks}
                            compact
                          />
                        ))}
                      </section>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500">
                      No public releases yet.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="playlists" className="mt-0">
                  <div className="rounded border border-dashed border-zinc-800 py-20 text-center text-sm text-zinc-500">
                    No public playlists yet.
                  </div>
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
                      {formatCount(artistData.followersCount)}
                    </p>
                  </div>
                  <div className="pl-4">
                    <p className="text-xs text-zinc-500">Following</p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCount(artistData.followingCount)}
                    </p>
                  </div>
                  <div className="pl-4">
                    <p className="text-xs text-zinc-500">Tracks</p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCount(artistData.trackCount)}
                    </p>
                  </div>
                </div>

                {artistData.bio && (
                  <p className="text-sm leading-6 whitespace-pre-line text-zinc-300">
                    {artistData.bio}
                  </p>
                )}

                <div className="space-y-3 text-sm text-zinc-400">
                  {artistData.location && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> {artistData.location}
                    </p>
                  )}
                  {artistData.website && (
                    <a
                      href={artistData.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 truncate transition hover:text-orange-500"
                    >
                      <LinkIcon className="h-4 w-4 shrink-0" />{" "}
                      {artistData.website}
                    </a>
                  )}
                </div>
              </aside>
            </div>
          </Tabs>
        </div>
      </div>
    </HydrateClient>
  );
}
