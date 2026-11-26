import Link from "next/link";

export const metadata = { title: "Not found | Music Stream", robots: { index: false } };

/** One friendly 404 for every missing page, hidden track or unknown user (hidden content looks nonexistent, never 403). */
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-zinc-950 px-6 py-24 text-center text-white">
      <p className="text-sm font-semibold tracking-widest text-orange-500 uppercase">404</p>
      <h1 className="text-3xl font-bold">We can&apos;t find that</h1>
      <p className="max-w-md text-zinc-400">The page may have moved, been made private or been removed. Check the link, or find something to listen to.</p>
      <div className="flex gap-3">
        <Link href="/" className="rounded-full bg-orange-700 px-5 py-2 text-sm font-semibold hover:bg-orange-600">Go home</Link>
        <Link href="/discover" className="rounded-full border border-zinc-600 px-5 py-2 text-sm font-semibold hover:border-zinc-400">Discover</Link>
      </div>
    </main>
  );
}
