import { planRequired } from "@/server/errors";

/**
 * Every plan limit lives here (PRD 2.3). No other code compares `user.plan` directly: it asks
 * `getEntitlements(user)` and reads a named capability, so limits are tunable in one place.
 */
export type Plan = "FREE" | "PRO";

export const MINUTE_MS = 60_000;

const FREE = {
  /** Total duration of the user's existing tracks; null means unlimited. */
  uploadTimeLimitMs: 180 * MINUTE_MS as number | null,
  maxFileBytes: 100 * 1024 * 1024,
  /** Fair-use ceiling on stored audio for unlimited-time plans. */
  storedAudioCapBytes: null as number | null,
  spotlightItems: 1,
  scheduledRelease: false,
  quietMode: false,
  replaceAudio: false,
  insightsRangesDays: [7] as readonly number[],
  insightsAllTimeTotals: true,
  insightsBreakdowns: false,
  proBadge: false,
};

const PRO: typeof FREE = {
  uploadTimeLimitMs: null,
  maxFileBytes: 100 * 1024 * 1024,
  storedAudioCapBytes: 50 * 1024 ** 3,
  spotlightItems: 5,
  scheduledRelease: true,
  quietMode: true,
  replaceAudio: true,
  insightsRangesDays: [7, 30, 90, 365],
  insightsAllTimeTotals: true,
  insightsBreakdowns: true,
  proBadge: true,
};

export const ENTITLEMENTS = { FREE, PRO } as const;
export type Entitlements = typeof FREE;
export type BooleanEntitlement = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

export function getEntitlements(user: { plan: Plan }): Entitlements {
  return ENTITLEMENTS[user.plan];
}

/** Throws `FORBIDDEN` / `PLAN_REQUIRED` unless the user's plan grants the capability (PL-4: enforced on the server). */
export function requireEntitlement(user: { plan: Plan }, capability: BooleanEntitlement, message?: string) {
  if (!getEntitlements(user)[capability]) throw planRequired(message);
}

/** Milliseconds of upload time left, or null when unlimited. Never negative. */
export function uploadTimeRemainingMs(user: { plan: Plan }, usedMs: number): number | null {
  const limit = getEntitlements(user).uploadTimeLimitMs;
  return limit === null ? null : Math.max(0, limit - usedMs);
}

/** Whether adding `addMs` of audio fits in the user's upload time. */
export function fitsUploadTime(user: { plan: Plan }, usedMs: number, addMs: number): boolean {
  const remaining = uploadTimeRemainingMs(user, usedMs);
  return remaining === null || addMs <= remaining;
}

/** Spotlight items shown on a profile after a downgrade: the first ones by position (PL-3). */
export function visibleSpotlightCount(user: { plan: Plan }): number {
  return getEntitlements(user).spotlightItems;
}
