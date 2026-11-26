/** Tiny user-agent reader for analytics: device class, browser family and "is this a crawler". No dependency, good enough for a dashboard. */
export interface AgentInfo {
  device: "desktop" | "mobile" | "tablet";
  browser: string;
  bot: boolean;
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|monitor|uptime|curl|wget|python-requests|node-fetch|axios|go-http/i;

export function parseUserAgent(ua: string | null | undefined): AgentInfo {
  const agent = ua ?? "";
  const bot = !agent || BOT.test(agent);
  const device = /ipad|tablet|(android(?!.*mobile))/i.test(agent) ? "tablet" : /mobi|iphone|ipod|android/i.test(agent) ? "mobile" : "desktop";
  // Order matters: Edge and Opera also say Chrome, Chrome also says Safari.
  const browser = /edg(e|a|ios)?\//i.test(agent) ? "Edge" : /opr\/|opera/i.test(agent) ? "Opera" : /firefox|fxios/i.test(agent) ? "Firefox" : /chrome|crios/i.test(agent) ? "Chrome" : /safari/i.test(agent) ? "Safari" : "Other";
  return { device, browser, bot };
}

/** The path as it is stored: no query or fragment, secret links masked, bounded length. Null for paths that are not tracked. */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0]!.slice(0, 200).replace(/\/s-[^/]+/g, "/s-…");
  if (/^\/(api|_next|admin)(\/|$)/.test(path)) return null;
  return path || "/";
}

/** Referrer reduced to its host; null for direct visits and for this site itself. */
export function cleanReferrer(raw: unknown, ownHost: string): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const host = new URL(raw).host.slice(0, 100);
    return host && host !== ownHost ? host : null;
  } catch {
    return null;
  }
}
