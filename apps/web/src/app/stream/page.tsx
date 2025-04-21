import Link from "next/link";
import { api, HydrateClient } from "@/trpc/server";
import TestPlayer from "../_components/test-player";

export default async function StreamPage() {
  const hello = await api.post.hello({ text: "from tRPC" });

  void api.post.getLatest.prefetch();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center text-zinc-300">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-2xl font-extrabold tracking-tight">
            Streaming app
          </h1>

          <div className="flex flex-col gap-2 mt-16 text-blue-400">
            <Link href={`/burak`}>Burak Artist Profile</Link>
            <Link href={`/man-i-trust/${"hope"}`}>Man I Trust - Hope</Link>
          </div>

          <TestPlayer />

        </div>
      </main>
    </HydrateClient>
  );
}
