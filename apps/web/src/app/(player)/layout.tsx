import { PlaybackProvider } from "../hooks/usePlayback";
import { api } from "@/trpc/server";
import { NowPlayingCard } from "../_components/NowPlayingCard";
import { PlaybackControls } from "../_components/GlobalPlaybackControls";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
export default async function Layout({
    children,
}: Readonly<{ children: React.ReactNode }>) {

    const session = await auth.api.getSession({
        headers: await headers(),
    })

    return (
        <PlaybackProvider>
            <main className="bg-zinc-950 min-h-screen">
                {children}
                <NowPlayingCard />
            </main>
            <PlaybackControls userId={session?.user?.id} />
        </PlaybackProvider>
    )
}

