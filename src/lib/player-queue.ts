/**
 * Pure queue logic of the player (PRD PL-P1, PL-P2): a *context* (the list the user played from), a
 * *user queue* ("Play next" / "Add to Next up", always played before the context continues) and a
 * *history* of the last 50 tracks. Shuffle plays the context in a random order that starts with the
 * current track; turning it off restores the original order. No DOM, no React: unit tested.
 */
export interface QueueTrack {
  id: string;
}

export type RepeatMode = "off" | "all" | "one";
export const HISTORY_LIMIT = 50;

export interface QueueState<T extends QueueTrack> {
  context: T[];
  /** Shuffled order of context ids while shuffle is on, else null. */
  order: string[] | null;
  currentId: string | null;
  /** The last context track that played: the context resumes after it when queued tracks finish. Defaults to `currentId`. */
  cursorId?: string | null;
  userQueue: T[];
  history: T[];
  repeat: RepeatMode;
}

/** Fisher-Yates over `ids`, with `firstId` (the current track) pinned to the front. */
export function shuffledOrder(ids: string[], firstId: string | null, random: () => number = Math.random): string[] {
  const rest = ids.filter((id) => id !== firstId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return firstId !== null && ids.includes(firstId) ? [firstId, ...rest] : rest;
}

/** The context in the order it will actually play. */
export function playOrder<T extends QueueTrack>(state: Pick<QueueState<T>, "context" | "order">): T[] {
  if (!state.order) return state.context;
  const byId = new Map(state.context.map((t) => [t.id, t]));
  const ordered = state.order.flatMap((id) => byId.get(id) ?? []);
  // Tracks added to the context after shuffling are appended in their original order.
  const known = new Set(state.order);
  return [...ordered, ...state.context.filter((t) => !known.has(t.id))];
}

export type NextResult<T> =
  | { kind: "track"; track: T; from: "queue" | "context" | "wrap"; userQueue: T[]; order: string[] | null }
  | { kind: "autoplay" }
  | { kind: "end" };

/**
 * What plays after the current track ends or is skipped: the next user-queued track first; then the next
 * track of the context; at the end of the context repeat-all wraps (re-shuffling when shuffle is on),
 * otherwise autoplay may continue with related tracks (decided by the caller), otherwise playback stops.
 * `canPlay` skips tracks the browser cannot play (UP-F3).
 */
export function pickNext<T extends QueueTrack>(
  state: QueueState<T>,
  { canPlay = () => true, autoplay = false, random = Math.random }: { canPlay?: (t: T) => boolean; autoplay?: boolean; random?: () => number } = {},
): NextResult<T> {
  let userQueue = state.userQueue;
  while (userQueue.length > 0) {
    const [head, ...tail] = userQueue;
    userQueue = tail;
    if (head && canPlay(head)) return { kind: "track", track: head, from: "queue", userQueue, order: state.order };
  }

  const list = playOrder(state);
  const index = list.findIndex((t) => t.id === (state.cursorId ?? state.currentId));
  for (let i = index + 1; i < list.length; i++) {
    const candidate = list[i]!;
    if (canPlay(candidate)) return { kind: "track", track: candidate, from: "context", userQueue, order: state.order };
  }

  if (state.repeat === "all" && list.length > 0) {
    const order = state.order ? shuffledOrder(state.context.map((t) => t.id), null, random) : null;
    const wrapped = order ? playOrder({ context: state.context, order }) : state.context;
    const first = wrapped.find((t) => canPlay(t));
    if (first) return { kind: "track", track: first, from: "wrap", userQueue, order };
  }
  return autoplay ? { kind: "autoplay" } : { kind: "end" };
}

/**
 * Previous: restarts the current track when more than 3 s in (PRD PL-P1); otherwise the last played
 * track from the history, else the previous track of the context, else restarts.
 */
export function pickPrevious<T extends QueueTrack>(
  state: QueueState<T>,
  currentTime: number,
  canPlay: (t: T) => boolean = () => true,
): { kind: "restart" } | { kind: "track"; track: T; history: T[] } {
  if (currentTime > 3) return { kind: "restart" };
  const history = [...state.history];
  while (history.length > 0) {
    const last = history.pop()!;
    if (canPlay(last)) return { kind: "track", track: last, history };
  }
  const list = playOrder(state);
  const index = list.findIndex((t) => t.id === (state.cursorId ?? state.currentId));
  for (let i = index - 1; i >= 0; i--) {
    if (canPlay(list[i]!)) return { kind: "track", track: list[i]!, history };
  }
  return { kind: "restart" };
}

/** Appends the track that just finished to the history (newest last, at most 50, no immediate duplicate). */
export function pushHistory<T extends QueueTrack>(history: T[], track: T | null | undefined): T[] {
  if (!track) return history;
  if (history.at(-1)?.id === track.id) return history;
  return [...history, track].slice(-HISTORY_LIMIT);
}

/** "Play next": goes to the front of the user queue (moving it there if already queued). */
export const queueNext = <T extends QueueTrack>(queue: T[], track: T): T[] => [track, ...queue.filter((t) => t.id !== track.id)];
/** "Add to Next up": goes to the back (kept in place if already queued). */
export const queueLast = <T extends QueueTrack>(queue: T[], track: T): T[] => (queue.some((t) => t.id === track.id) ? queue : [...queue, track]);

/** Turning shuffle on keeps the current track first; turning it off restores the original order. */
export function toggleShuffleOrder<T extends QueueTrack>(state: Pick<QueueState<T>, "context" | "order" | "currentId">, on: boolean, random?: () => number): string[] | null {
  return on ? shuffledOrder(state.context.map((t) => t.id), state.currentId, random) : null;
}

export function nextRepeat(mode: RepeatMode): RepeatMode {
  return mode === "off" ? "all" : mode === "all" ? "one" : "off";
}
