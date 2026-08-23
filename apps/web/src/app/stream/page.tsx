import Link from "next/link";
import { HydrateClient } from "@/trpc/server";
import TestPlayer from "../_components/test-player";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import WaveAudioPlayer from "../_components/WaveAudioPlayer";

export default async function StreamPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center py-8 text-zinc-300">
        <div className="xjustify-center container flex flex-col items-center gap-4 px-4 py-2">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Streaming app
          </h1>

          <div className="flex flex-col gap-2 text-blue-400">
            <Link href="/">Go to Home</Link>
            <Link href={`/burak`}>Burak Artist Profile</Link>
            <Link href={`/man-i-trust/${"hope"}`}>Man I Trust - Hope</Link>
          </div>

          {/* <TestPlayer userId={session?.session?.userId} /> */}
          <WaveAudioPlayer />
        </div>
      </main>
    </HydrateClient>
  );
}
