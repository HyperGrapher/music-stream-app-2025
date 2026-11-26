/**
 * Permalink vocabulary shared by server and client: usernames, slugs and their reserved words
 * (PRD section 4.2). A unit test checks RESERVED_USERNAMES against the directory names in
 * `src/app`, so adding a top-level route without reserving it fails CI.
 */

/** First-level route segments of `src/app` plus the words PRD IA-1 reserves. Keep sorted. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "about", "admin", "api", "assets", "charts", "copyright", "discover", "embed", "favicon.ico",
  "feed", "forgot-password", "help", "login", "logout", "manifest.webmanifest", "me", "messages",
  "new", "notifications", "null", "oembed", "onboarding", "pages", "privacy", "profile",
  "reset-password", "robots.txt", "search", "settings", "sets", "signin", "signup", "sitemap.xml",
  "static", "stations", "studio", "suspended", "tags", "terms", "track", "u", "undefined", "upload",
  "verify-email", "you", "_next",
]);

/** Sub-routes of a profile (`/{username}/{segment}`): a track slug may not collide with them. */
export const RESERVED_TRACK_SLUGS: ReadonlySet<string> = new Set([
  "albums", "comments", "followers", "following", "likes", "popular-tracks", "reposts", "sets",
  "spotlight", "tracks",
]);

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,24}$/;
export const SLUG_MAX_LENGTH = 80;

/** Letters NFKD cannot decompose into ASCII. */
const TRANSLITERATIONS: Record<string, string> = {
  ı: "i", İ: "i", ß: "ss", æ: "ae", Æ: "ae", ø: "o", Ø: "o", đ: "d", Đ: "d", ł: "l", Ł: "l",
  þ: "th", Þ: "th", œ: "oe", Œ: "oe",
};

/** Lowercase ASCII words joined by single hyphens: "Gitarda Bir Riff #4!" -> "gitarda-bir-riff-4". */
export function slugify(text: string, maxLength = SLUG_MAX_LENGTH): string {
  return text
    .replace(/[^\u0000-\u007f]/g, (char) => TRANSLITERATIONS[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(value));
}

/** Valid shape and not reserved. Availability (uniqueness) is checked against the database. */
export function isValidUsername(value: string): boolean {
  const username = normalizeUsername(value);
  return USERNAME_PATTERN.test(username) && !isReservedUsername(username);
}

/** A valid-looking username derived from free text (a name or an email's local part). */
export function usernameBase(seed: string): string {
  let base = slugify(seed, 25).replace(/-/g, "_");
  if (base.length < 3) base = `${base}${"user".slice(0, 4 - base.length)}`.slice(0, 25);
  if (isReservedUsername(base)) base = `${base.slice(0, 20)}_user`;
  return base.slice(0, 25);
}

/**
 * First candidate not rejected by `isTaken`: `base`, `base-2`, `base-3`, ... Suffixes shorten the
 * base so the result stays within `maxLength`.
 */
export async function firstFree(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxLength: number,
  separator = "-",
): Promise<string> {
  const root = base.slice(0, maxLength);
  if (!(await isTaken(root))) return root;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `${separator}${n}`;
    const candidate = `${root.slice(0, maxLength - suffix.length)}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error("Could not find a free name");
}

/** Slug candidate for a track or collection title; never empty and never a reserved slug. */
export function slugBase(title: string, fallback = "untitled"): string {
  const slug = slugify(title) || fallback;
  return RESERVED_TRACK_SLUGS.has(slug) ? `${slug}-1` : slug;
}

/** Tag normalisation (PRD 7.3): lowercase, `[a-z0-9 &'-]`, 2-30 chars, de-duplicated, at most 30. */
export function normalizeTags(input: string | string[], max = 30): string[] {
  const raw = Array.isArray(input) ? input : input.split(",");
  const tags: string[] = [];
  for (const item of raw) {
    const tag = item.toLowerCase().replace(/[^a-z0-9 &'-]/g, "").replace(/\s+/g, " ").trim();
    if (tag.length >= 2 && tag.length <= 30 && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= max) break;
  }
  return tags;
}
