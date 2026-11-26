import { AuthDialog } from "@/components/auth/AuthDialog";
import { OnboardingGuard, VerifyEmailBanner } from "@/components/auth/AppShellGuards";
import { PlaybackControls } from "../_components/GlobalPlaybackControls";
import { PlayerControllerWrapper } from "@/components/PlayerControllerWrapper";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Layout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    // Get session server-side
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    const userId = session?.user?.id || null;

    return (
        <>
            <VerifyEmailBanner />
            <OnboardingGuard />
            <AuthDialog />
            <main className="bg-zinc-950 min-h-[calc(100vh-190px)] relative">
                {children}
            </main>
            <PlaybackControls />
            <PlayerControllerWrapper initialUserId={userId} />
        </>
    )
}


