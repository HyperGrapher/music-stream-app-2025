import { api } from "@/trpc/server";
import { NowPlayingCard } from "../_components/NowPlayingCard";
import { PlaybackControls } from "../_components/GlobalPlaybackControls";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { PlayerController } from "@/store/player";

export default async function Layout({
    children,
}: Readonly<{ children: React.ReactNode }>) {

    const session = await auth.api.getSession({
        headers: await headers(),
    })

    const userId = session?.user?.id;

    return (
        <>
            <main className="bg-zinc-950 min-h-screen relative pb-[60px]">
                {children}
                <NowPlayingCard />
            </main>
            <PlaybackControls />
            <PlayerController userId={userId} />
        </>
    )
}

