import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/PasswordForms";

export const metadata: Metadata = { title: "Reset password | Music Stream", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm token={token} invalid={error !== undefined} />
    </AuthShell>
  );
}
