import assert from "node:assert/strict";
import test from "node:test";

import { HISTORY_LIMIT, nextRepeat, pickNext, pickPrevious, playOrder, pushHistory, queueLast, queueNext, shuffledOrder, toggleShuffleOrder, type QueueState } from "./player-queue";

const t = (id: string) => ({ id });
const ids = (list: { id: string }[]) => list.map((x) => x.id);
const base = (over: Partial<QueueState<{ id: string }>> = {}): QueueState<{ id: string }> => ({
  context: ["a", "b", "c", "d"].map(t), order: null, currentId: "a", userQueue: [], history: [], repeat: "off", ...over,
});
/** Deterministic "random": a repeating sequence in [0, 1). */
const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };

test("PL-P2: the next track follows the context; the end stops, or asks for autoplay", () => {
  const next = pickNext(base({ currentId: "b" }));
  assert.equal(next.kind === "track" && next.track.id, "c");
  assert.equal(pickNext(base({ currentId: "d" })).kind, "end");
  assert.equal(pickNext(base({ currentId: "d" }), { autoplay: true }).kind, "autoplay");
});

test("PL-P2: user-queued tracks play before the context continues, in order, and are consumed", () => {
  const state = base({ currentId: "a", userQueue: [t("q1"), t("q2")] });
  const first = pickNext(state);
  assert.ok(first.kind === "track" && first.track.id === "q1" && first.from === "queue");
  const second = pickNext({ ...state, currentId: "q1", userQueue: first.kind === "track" ? first.userQueue : [] });
  assert.ok(second.kind === "track" && second.track.id === "q2");
  const third = pickNext({ ...state, currentId: "q2", cursorId: "a", userQueue: [] });
  assert.ok(third.kind === "track" && third.track.id === "b", "the context resumes after the queue, not after the queued track");
});

test("PL-P1: repeat all wraps to the start, and re-shuffles when shuffle is on", () => {
  const wrapped = pickNext(base({ currentId: "d", repeat: "all" }));
  assert.ok(wrapped.kind === "track" && wrapped.track.id === "a" && wrapped.from === "wrap");
  const order = ["a", "c", "b", "d"];
  const shuffled = pickNext(base({ currentId: "d", repeat: "all", order }), { random: seq(0.9, 0.1, 0.5) });
  assert.ok(shuffled.kind === "track" && shuffled.order?.length === 4);
  assert.equal(pickNext(base({ currentId: "d", repeat: "one" })).kind, "end", "repeat-one is handled by the player when a track ends");
});

test("PL-P1: shuffle keeps the current track first, is a permutation, and turning it off restores the order", () => {
  for (let round = 0; round < 50; round++) {
    const order = shuffledOrder(["a", "b", "c", "d", "e"], "c");
    assert.equal(order[0], "c");
    assert.deepEqual([...order].sort(), ["a", "b", "c", "d", "e"]);
  }
  const state = base({ currentId: "c" });
  const on = toggleShuffleOrder(state, true, seq(0.3, 0.6, 0.1));
  assert.ok(on?.[0] === "c");
  assert.deepEqual(ids(playOrder({ context: state.context, order: on })).sort(), ["a", "b", "c", "d"]);
  assert.equal(toggleShuffleOrder({ ...state, order: on }, false), null);
  assert.deepEqual(ids(playOrder({ context: state.context, order: null })), ["a", "b", "c", "d"]);
});

test("shuffle plays every track exactly once before the context ends", () => {
  let state = base({ currentId: "b", order: shuffledOrder(["a", "b", "c", "d"], "b", seq(0.2, 0.8, 0.5)) });
  const played = ["b"];
  for (;;) {
    const next = pickNext(state);
    if (next.kind !== "track") break;
    played.push(next.track.id);
    state = { ...state, currentId: next.track.id };
  }
  assert.deepEqual([...played].sort(), ["a", "b", "c", "d"]);
  assert.equal(played.length, 4);
});

test("tracks added to the context while shuffled are appended, not lost", () => {
  const order = ["b", "d", "a", "c"];
  assert.deepEqual(ids(playOrder({ context: [...base().context, t("e")], order })), ["b", "d", "a", "c", "e"]);
});

test("UP-F3: tracks the browser cannot play are skipped, from the queue and the context", () => {
  const canPlay = (x: { id: string }) => x.id !== "b" && x.id !== "q1";
  const next = pickNext(base({ currentId: "a", userQueue: [t("q1")] }), { canPlay });
  assert.ok(next.kind === "track" && next.track.id === "c");
  assert.equal(pickNext(base({ currentId: "c", context: ["c", "d"].map(t) }), { canPlay: (x) => x.id === "c" }).kind, "end");
});

test("PL-P1: previous restarts after 3 s, else goes back through history, else the previous in the context", () => {
  assert.equal(pickPrevious(base({ currentId: "c" }), 4).kind, "restart");
  const viaHistory = pickPrevious(base({ currentId: "c", history: [t("x"), t("a")] }), 1);
  assert.ok(viaHistory.kind === "track" && viaHistory.track.id === "a" && ids(viaHistory.history).join() === "x");
  const viaContext = pickPrevious(base({ currentId: "c" }), 1);
  assert.ok(viaContext.kind === "track" && viaContext.track.id === "b");
  assert.equal(pickPrevious(base({ currentId: "a" }), 1).kind, "restart");
});

test("PL-P2: history keeps the last 50 and ignores an immediate repeat", () => {
  let history: { id: string }[] = [];
  for (let i = 0; i < 80; i++) history = pushHistory(history, t(String(i)));
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history.at(-1)?.id, "79");
  assert.equal(pushHistory(history, t("79")), history);
  assert.equal(pushHistory(history, null), history);
});

test("PL-P4: Play next goes first (moving an already queued track), Add to Next up goes last", () => {
  const queue = [t("x"), t("y")];
  assert.deepEqual(ids(queueNext(queue, t("z"))), ["z", "x", "y"]);
  assert.deepEqual(ids(queueNext(queue, t("y"))), ["y", "x"]);
  assert.deepEqual(ids(queueLast(queue, t("z"))), ["x", "y", "z"]);
  assert.equal(queueLast(queue, t("x")), queue);
});

test("repeat cycles off -> all -> one -> off", () => {
  assert.deepEqual(["off", "all", "one"].map((m) => nextRepeat(m as "off")), ["all", "one", "off"]);
});
