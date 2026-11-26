import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResendVerification } from "@/components/auth/PasswordForms";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Verify your email | Music Stream", robots: { index: false } };

/** Landing page of the verification link (`?status=success` / `?error=...`) and of "check your inbox". */
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const { status, error } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (status === "success" && !error) {
    return (
      <AuthShell title="Email verified" subtitle="You can now upload, comment and repost.">
        <Link href="/" className="font-semibold text-orange-400 hover:underline">
          Continue to Music Stream
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={error ? "That link didn't work" : "Check your inbox"}
      subtitle={error ? "The verification link is invalid or has expired." : "We sent you a link to verify your email address."}
    >
      <p className="text-sm text-zinc-300">
        {session ? <ResendVerification email={session.user.email} /> : <Link href="/signin?next=/verify-email" className="font-semibold text-orange-400 hover:underline">Sign in to get a new link</Link>}
      </p>
    </AuthShell>
  );
}
