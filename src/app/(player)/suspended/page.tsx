import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account suspended | Music Stream", robots: { index: false } };

/** Where a suspended person lands after trying to sign in (PRD AD-2). */
export default function SuspendedPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center text-white">
      <h1 className="text-2xl font-bold">This account is suspended</h1>
      <p className="mt-3 text-zinc-300">
        We suspended this account because it broke our community rules. While it is suspended you can&apos;t sign in, and its music and profile are hidden.
      </p>
      <p className="mt-3 text-sm text-zinc-400">
        If you think this is a mistake, reply to the email we sent you, or write to the address in the footer of any message from Music Stream, and include your username.
      </p>
      <Link href="/" className="mt-8 inline-block rounded-full bg-orange-700 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-800">Back to Music Stream</Link>
    </div>
  );
}
