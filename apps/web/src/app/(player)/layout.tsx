import { PlaybackProvider } from "../hooks/usePlayback";
import { api } from "@/trpc/server";
import { NowPlayingCard } from "../_components/NowPlayingCard";
import { PlaybackControls } from "../_components/GlobalPlaybackControls";

export default async function Layout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <PlaybackProvider>
            <main className="bg-zinc-950 min-h-screen">
                {children}
                <NowPlayingCard />
            </main>
            <PlaybackControls />
        </PlaybackProvider>
    )
}

