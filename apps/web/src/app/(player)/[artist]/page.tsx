import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ artist: string }>;
}): Promise<Metadata> {
    const { artist } = await params;
    const artistData = await api.artist.getArtist({ artist: artist });

    if (!artistData) {
        return {
            title: "Artist Not Found",
        };
    }

    return {
        title: `${artistData.name} | Music Player`,
        description: artistData.bio || `Check out ${artistData.name}'s tracks, albums, and playlists.`,
    };
}

export default async function ArtistPage({
    params,
}: {
    params: Promise<{ artist: string }>;
}) {
    const { artist } = await params;
    const artistData = await api.artist.getArtist({ artist: artist });

    if (!artistData) {
        notFound();
    }

    // Pre-fetch latest tracks for better performance
    const latestTracksPromise = api.artist.getLatestTracks({
        artist: artist,
        limit: 5,
    }).catch(() => []);

    const popularTracksPromise = api.artist.getPopularTracks({
        artist: artist,
        limit: 5,
    }).catch(() => []);

    const [latestTracks, popularTracks] = await Promise.all([
        latestTracksPromise,
        popularTracksPromise,
    ]);

    return (
        <HydrateClient>
            <div className="min-h-screen bg-black text-white">
                {/* Hero section with background image */}
                <div className="relative h-60 w-full bg-gradient-to-b from-zinc-800 to-black">
                    {artistData?.profileImage && (
                        <div className="absolute inset-0 opacity-40">
                            {/* 1210x265  */}
                            <img
                                src={/* artistData.profileImage ?? */ 'https://placehold.co/1280x250'}
                                alt={`${artistData.name}'s background`}
                                // fill
                                className="object-cover"
                                // priority
                            />
                        </div>
                    )}

                    <div className="absolute bottom-0 left-0 flex w-full items-end p-6">
                        <div className="flex items-end gap-6">
                            <Avatar className="h-36 w-36 rounded-md border border-zinc-700 shadow-lg">
                                <AvatarImage src={artistData.image ?? ''} alt={artistData.name} />
                                <AvatarFallback className="text-3xl">{artistData.name.charAt(0)}</AvatarFallback>
                            </Avatar>

                            <div className="mb-3">
                                <h1 className="text-4xl font-bold">{artistData.name}</h1>
                                <div className="mt-2 flex items-center gap-4 text-sm text-zinc-400">
                                    {artistData.location && (
                                        <span>{artistData.location}</span>
                                    )}
                                    <span>Joined {formatDistanceToNow(new Date(artistData.createdAt), { addSuffix: true })}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats section */}
                <div className="flex border-b border-zinc-800 px-6 py-4">
                    <div className="flex gap-6">
                        <div className="text-center">
                            <div className="text-xl font-semibold">{artistData.trackCount}</div>
                            <div className="text-sm text-zinc-400">Tracks</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-semibold">{artistData.followersCount}</div>
                            <div className="text-sm text-zinc-400">Followers</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xl font-semibold">{artistData.followingCount}</div>
                            <div className="text-sm text-zinc-400">Following</div>
                        </div>
                    </div>
                </div>

                {/* Bio section */}
                {artistData.bio && (
                    <div className="border-b border-zinc-800 px-6 py-4">
                        <p className="text-sm text-zinc-300">{artistData.bio}</p>
                    </div>
                )}

                {/* Tabs section */}
                <div className="px-6 py-4">
                    <Tabs defaultValue="all">
                        <TabsList className="mb-6 w-full justify-start border-b border-zinc-800 bg-transparent">
                            <TabsTrigger value="all" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">All</TabsTrigger>
                            <TabsTrigger value="popular" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">Popular tracks</TabsTrigger>
                            <TabsTrigger value="tracks" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">Tracks</TabsTrigger>
                            <TabsTrigger value="albums" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">Albums</TabsTrigger>
                            <TabsTrigger value="playlists" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">Playlists</TabsTrigger>
                            <TabsTrigger value="reposts" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-white">Reposts</TabsTrigger>
                        </TabsList>

                        <TabsContent value="all">
                            <h1>All</h1>
                        </TabsContent>

                        <TabsContent value="popular">
                            <h1>Popular tracks</h1>
                        </TabsContent>

                        <TabsContent value="tracks">
                            <h1>Tracks</h1>
                        </TabsContent>

                        <TabsContent value="albums">
                            <h1>Albums</h1>
                        </TabsContent>

                        <TabsContent value="playlists">
                            <h1>Playlists</h1>
                        </TabsContent>

                        <TabsContent value="reposts">
                            <h1>Reposts</h1>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </HydrateClient>
    );
} 