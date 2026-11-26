/**
 * `#t=` start-time links (PRD TR-9 / sharing): `#t=83`, `#t=83s`, `#t=1m23s`, `#t=1:23`, `#t=1:02:03`.
 * Returns whole seconds, or null when the fragment is absent or malformed.
 */
export function parseTimeFragment(hash: string): number | null {
  const value = /(?:^|[#&])t=([^&]+)/.exec(hash)?.[1];
  if (!value) return null;
  let seconds: number | null = null;
  if (/^\d+$/.test(value) || /^\d+s$/.test(value)) seconds = Number.parseInt(value, 10);
  else if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(value)) seconds = value.split(":").reduce((total, part) => total * 60 + Number.parseInt(part, 10), 0);
  else {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    if (match && (match[1] ?? match[2] ?? match[3])) seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  }
  return seconds !== null && Number.isFinite(seconds) ? seconds : null;
}

/** `1m23s` style fragment value for a number of seconds. */
export function formatTimeFragment(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h > 0 ? `${h}h` : ""}${h > 0 || m > 0 ? `${m}m` : ""}${s}s`;
}
