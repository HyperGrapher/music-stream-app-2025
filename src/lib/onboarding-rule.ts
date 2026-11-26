/** Pure (client-safe) rule for the forced onboarding redirect. */
/** PRD 6.2: where may a not-yet-onboarded user be? Auth, legal and onboarding itself only. */
const ONBOARDING_EXEMPT = ["/onboarding", "/signin", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/terms", "/privacy", "/copyright"];
export function needsOnboardingRedirect(user: { onboardedAt?: Date | string | null } | null | undefined, pathname: string) {
  if (!user || user.onboardedAt) return false;
  return !ONBOARDING_EXEMPT.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

