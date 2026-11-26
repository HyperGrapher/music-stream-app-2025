/** Pure scoring for recommendations (PRD 10.6): no database, unit tested. */

export interface Taste {
  genres: Map<string, number>;
  tags: Map<string, number>;
  /** Creators the listener follows: a small boost. */
  followed: ReadonlySet<string>;
}

export interface Candidate {
  id: string;
  creatorId: string;
  genre: string | null;
  tags: string[];
  playCount: number;
  likeCount: number;
  publishedAt: Date;
  /** Liked by people who liked the same tracks as the listener (co-likes). */
  coLiked?: boolean;
}

export const addWeight = (map: Map<string, number>, key: string | null | undefined, weight: number) => {
  if (key) map.set(key.toLowerCase(), (map.get(key.toLowerCase()) ?? 0) + weight);
};

/** Builds a taste profile from weighted signals: `[genre, tags, weight]` per liked/reposted/played/added track and onboarding genre. */
export function buildTaste(signals: { genre: string | null; tags: string[]; weight: number }[], followed: Iterable<string> = []): Taste {
  const taste: Taste = { genres: new Map(), tags: new Map(), followed: new Set(followed) };
  for (const signal of signals) {
    addWeight(taste.genres, signal.genre, signal.weight);
    for (const tag of signal.tags) addWeight(taste.tags, tag, signal.weight * 0.5);
  }
  return taste;
}

export const topKeys = (map: Map<string, number>, n: number) => [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
export const hasSignal = (taste: Taste) => taste.genres.size + taste.tags.size > 0;

/** Normalised 0..1+ preference of a candidate for the profile. */
export function affinity(candidate: Pick<Candidate, "creatorId" | "genre" | "tags">, taste: Taste): number {
  const maxGenre = Math.max(1, ...taste.genres.values());
  const maxTag = Math.max(1, ...taste.tags.values());
  const genre = candidate.genre ? (taste.genres.get(candidate.genre.toLowerCase()) ?? 0) / maxGenre : 0;
  const tags = candidate.tags.length ? Math.min(1, candidate.tags.reduce((sum, t) => sum + (taste.tags.get(t.toLowerCase()) ?? 0) / maxTag, 0) / 3) : 0;
  return genre + 0.5 * tags + (taste.followed.has(candidate.creatorId) ? 0.3 : 0);
}

const DAY_MS = 86_400_000;

/** score = affinity x log(popularity) x recency (RC-2); co-likes count extra. */
export function score(candidate: Candidate, taste: Taste, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - candidate.publishedAt.getTime()) / DAY_MS);
  const recency = 1 / (1 + ageDays / 90);
  const popularity = Math.log(candidate.playCount + 2 * candidate.likeCount + 2);
  const base = affinity(candidate, taste) + (candidate.coLiked ? 0.6 : 0);
  return base * popularity * recency;
}

/** Diversity (RC-2): at most `perCreator` tracks of one creator in the result. */
export function diversify<T extends { creatorId: string }>(ranked: T[], limit: number, perCreator = 2): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of ranked) {
    const count = counts.get(item.creatorId) ?? 0;
    if (count >= perCreator) continue;
    counts.set(item.creatorId, count + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function rank<T extends Candidate>(candidates: T[], taste: Taste, now: Date): T[] {
  return candidates
    .map((c) => ({ c, s: score(c, taste, now) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c);
}

/** Jaccard similarity of two tag sets (RC-3). */
export function jaccard(a: string[], b: string[]): number {
  const left = new Set(a.map((t) => t.toLowerCase()));
  const right = new Set(b.map((t) => t.toLowerCase()));
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const t of left) if (right.has(t)) shared++;
  return shared / (left.size + right.size - shared);
}
