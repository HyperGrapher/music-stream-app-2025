import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { auth } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in | Music Stream", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(safeNextPath(next));
  return (
    <AuthShell title="Sign in" subtitle="Welcome back.">
      <AuthForm mode="signin" next={safeNextPath(next)} />
    </AuthShell>
  );
}
