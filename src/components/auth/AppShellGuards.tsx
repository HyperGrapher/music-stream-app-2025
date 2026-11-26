"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { ResendVerification } from "@/components/auth/PasswordForms";
import { useUser } from "@/hooks/useUser";
import { needsOnboardingRedirect } from "@/lib/onboarding-rule";

/** Forces `/onboarding` for accounts that have not finished it (PRD 6.2), from every page but auth/legal ones. */
export function OnboardingGuard() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const redirect = needsOnboardingRedirect(user, pathname);
  useEffect(() => {
    if (redirect) router.replace("/onboarding");
  }, [redirect, router]);
  return null;
}

/** AU-4: unverified accounts can listen and like, but are told what they cannot do yet. */
export function VerifyEmailBanner() {
  const { user } = useUser();
  if (user?.emailVerified !== false || !user.email) return null;
  return (
    <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-100">
      Verify your email to upload, comment and repost. <ResendVerification email={user.email} />
    </div>
  );
}
