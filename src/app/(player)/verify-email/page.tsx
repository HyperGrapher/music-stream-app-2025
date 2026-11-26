import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { StatusCard } from "@/components/auth/StatusCard";
import { ResendVerification } from "@/components/auth/PasswordForms";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Verify your email | Music Stream", robots: { index: false } };

/** Landing page of the verification link (`?status=success` / `?error=...`) and of "check your inbox". */
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (status === "success" && !error) {
    return (
      <StatusCard tone="success" title="Email verified" subtitle="You can now upload, comment and repost.">
        <Link href="/" className="inline-flex h-10 items-center rounded-full bg-orange-500 px-6 font-semibold text-black hover:bg-orange-400">
          Continue to Music Stream
        </Link>
      </StatusCard>
    );
  }
  return (
    <StatusCard
      tone={error ? "error" : "info"}
      title={error ? "That link didn't work" : "Check your inbox"}
      subtitle={error ? "The verification link is invalid or has expired." : "We sent you a link to verify your email address."}
    >
      {session ? <ResendVerification email={session.user.email} /> : <Link href="/signin?next=/verify-email" className="font-semibold text-orange-400 hover:underline">Sign in to get a new link</Link>}
    </StatusCard>
  );
}
