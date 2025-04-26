import { WaveformTrackItem } from "@/app/_components/WaveformTrackItem";
import { CompactTrackItem } from "@/app/_components/CompactTrackItem";
import { HydrateClient } from "@/trpc/server";
import type { Track } from "@prisma/client";

// Helper function to create a proper track object
function createTrackWithUser(override: Partial<Track> = {}): Track & { user?: { name: string; image?: string | null } } {
  return {
    id: "1",
    title: "Time Is Running Out",
    description: "From the album Absolution",
    audioUrl: "https://example.com/audio/time-is-running-out.mp3",
    duration: 240,
    waveformData: JSON.stringify(Array.from({ length: 100 }, () => Math.floor(Math.random() * 100))),
    isOriginal: true,
    isPrivate: false,
    genre: "Rock",
    subGenre: null,
    bpm: 120,
    key: "Cm",
    tags: "rock,alternative,british",
    releaseDate: new Date("2003-09-08"),
    recordLabel: "Warner Music",
    artworkUrl: "https://placehold.co/500x500/orange/white?text=Track+Cover",
    playCount: 12345,
    downloadCount: 500,
    likeCount: 840,
    repostCount: 125,
    commentCount: 32,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user1",
    albumId: "album1",
    user: {
      name: "Muse",
      image: "https://placehold.co/400x400/purple/white?text=Muse"
    },
    ...override
  };
}

// Create sample tracks
const sampleTracks = Array.from({ length: 5 }, (_, i) => 
  createTrackWithUser({
    id: `track-${i + 1}`,
    title: `Sample Track ${i + 1}`,
    duration: 180 + Math.floor(Math.random() * 180),
    playCount: Math.floor(Math.random() * 10000),
    likeCount: Math.floor(Math.random() * 1000),
    commentCount: Math.floor(Math.random() * 100),
    genre: ["Rock", "Electronic", "Pop", "Alternative"][Math.floor(Math.random() * 4)],
    createdAt: new Date(Date.now() - Math.floor(Math.random() * 10000000)),
    updatedAt: new Date(Date.now() - Math.floor(Math.random() * 1000000))
  })
);

export default function TrackComponentsDemo() {
  return (
    <HydrateClient>
      <div className="min-h-screen bg-zinc-950 text-white p-8">
        <h1 className="text-3xl font-bold mb-8">Track Components Demo</h1>
        
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 border-b border-zinc-800 pb-2">WaveformTrackItem Component</h2>
          <p className="text-zinc-400 mb-6">
            This component displays a track with a waveform visualization, similar to SoundCloud's track layout.
          </p>
          
          <div className="space-y-4 max-w-3xl">
            {sampleTracks.slice(0, 3).map(track => (
              <WaveformTrackItem key={track.id} track={track} />
            ))}
          </div>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-4 border-b border-zinc-800 pb-2">CompactTrackItem Component</h2>
          <p className="text-zinc-400 mb-6">
            This is a more compact version for playlist views and secondary displays.
          </p>
          
          <div className="space-y-1 max-w-2xl bg-zinc-900 rounded-md p-4">
            {sampleTracks.map((track, index) => (
              <CompactTrackItem 
                key={track.id} 
                track={track} 
                index={index} 
              />
            ))}
          </div>
        </section>
      </div>
    </HydrateClient>
  );
}