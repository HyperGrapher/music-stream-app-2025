/** Direct-message text helpers (PRD 13.3): shared by the server (cards) and the UI (linkify). No imports, easy to test. */

export const MESSAGE_MAX = 2000;
/** At most this many track/collection cards are shown under one message. */
export const MAX_CARDS_PER_MESSAGE = 3;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

export type TextPart = { type: "text" | "link"; value: string };

/** Splits plain text into text and http(s) links; punctuation after a link ("see https://x.io.") stays text. */
export function splitLinks(body: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index;
    let url = match[0];
    const trimmed = TRAILING_PUNCTUATION.exec(url)?.[0] ?? "";
    if (trimmed) url = url.slice(0, -trimmed.length);
    if (start > last) parts.push({ type: "text", value: body.slice(last, start) });
    parts.push({ type: "link", value: url });
    last = start + url.length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return parts;
}

export const extractUrls = (body: string) => [...new Set(splitLinks(body).filter((p) => p.type === "link").map((p) => p.value))];

export type ContentRef = { kind: "track" | "set"; username: string; slug: string; secret: string | null };

/** `https://host/{user}/{slug}[/s-{secret}]` or `.../{user}/sets/{slug}[/s-{secret}]` on this site, else null. */
export function parseContentUrl(url: string, appHost: string): ContentRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.host !== appHost) return null;
  const segments = parsed.pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const secretOf = (s: string | undefined) => (s?.startsWith("s-") && s.length > 2 ? s.slice(2) : null);
  const [username, second, third, fourth] = segments;
  if (!username || !second) return null;
  if (second === "sets") {
    if (!third || segments.length > 4) return null;
    return { kind: "set", username: username.toLowerCase(), slug: third, secret: secretOf(fourth) };
  }
  if (segments.length > 3) return null;
  return { kind: "track", username: username.toLowerCase(), slug: second, secret: secretOf(third) };
}

/** One conversation per pair of people: the two ids, sorted. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Why the composer is closed, in words for the sender (reason codes come from `messagingStatus`). */
export function cannotSendText(reason: string | null | undefined, name: string): string | null {
  switch (reason) {
    case "POLICY":
      return `${name} doesn't accept messages from you.`;
    case "BLOCKED":
      return "You can't message this person.";
    case "SELF":
      return "You can't message yourself.";
    case "UNAVAILABLE":
      return "This person can't be messaged.";
    default:
      return null;
  }
}
