/**
 * Injectable clock (PRD QA-3). Everything time-dependent on the server (scheduled releases, play
 * dedupe windows, rate limit windows, digests, charts) reads `now()` instead of `new Date()`, so
 * tests can move time without sleeping. Production never calls `setClock`.
 */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

/** Tests only: `setClock(() => new Date("2030-01-01"))`. Pass `null` (or call `resetClock`) to restore. */
export function setClock(provider: (() => Date) | null) {
  override = provider;
}

export function resetClock() {
  override = null;
}
