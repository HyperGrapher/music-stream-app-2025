import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";

export async function generateMetadata({
  params,
}: {
  params: { artist: string; song: string };
}): Promise<Metadata> {
  const artist = await api.artist.getArtist({ artist: params.artist });
  
  if (!artist) {
    return {
      title: "Song Not Found",
    };
  }
  
  // For now, we're just using the slug as the title
  // In a real implementation, we'd look up the actual track
  const formattedTitle = params.song
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return {
    title: `${formattedTitle} by ${artist.name} | Music Player`,
    description: `Listen to ${formattedTitle} by ${artist.name}`,
  };
}

export default async function SongPage({
  params,
}: {
  params: Promise<{
    artist: string;
    song: string;
  }>;
}) {
  const { artist, song } = await params;
  const artistData = await api.artist.getArtist({ artist: artist });
  
  if (!artist) {
    notFound();
  }
  
  // Format song name from slug for display
  const formattedSongName = song
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <HydrateClient>
      <div className="min-h-screen bg-black p-8 text-white">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-2 text-4xl font-bold">{formattedSongName}</h1>
          <h2 className="mb-8 text-xl text-zinc-400">by {artistData?.name}</h2>
          
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-lg">This song page is a placeholder and will be implemented later.</p>
          </div>
        </div>
      </div>
    </HydrateClient>
  );
} 