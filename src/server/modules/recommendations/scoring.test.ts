import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { affinity, buildTaste, diversify, jaccard, rank, score, topKeys, type Candidate } from "./scoring";

const now = new Date("2026-06-01T00:00:00Z");
const day = 86_400_000;
const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({ id, creatorId: `c-${id}`, genre: "rock", tags: [], playCount: 10, likeCount: 2, publishedAt: new Date(now.getTime() - 5 * day), ...over });

describe("taste profile", () => {
  it("accumulates weighted genre and tag signals", () => {
    const taste = buildTaste([{ genre: "Rock", tags: ["Indie"], weight: 3 }, { genre: "rock", tags: [], weight: 1 }, { genre: "jazz", tags: [], weight: 2 }]);
    assert.deepEqual(topKeys(taste.genres, 2), ["rock", "jazz"]);
    assert.equal(taste.genres.get("rock"), 4);
    assert.equal(taste.tags.get("indie"), 1.5);
  });
});

describe("scoring", () => {
  const taste = buildTaste([{ genre: "rock", tags: ["indie"], weight: 3 }], ["followed-creator"]);

  it("prefers matching genre and tags, and followed creators", () => {
    assert.ok(affinity(cand("a"), taste) > affinity(cand("b", { genre: "jazz" }), taste));
    assert.ok(affinity(cand("a", { tags: ["indie"] }), taste) > affinity(cand("a"), taste));
    assert.ok(affinity(cand("a", { creatorId: "followed-creator" }), taste) > affinity(cand("a"), taste));
  });

  it("boosts popular, recent and co-liked tracks", () => {
    assert.ok(score(cand("a", { playCount: 1000 }), taste, now) > score(cand("a"), taste, now));
    assert.ok(score(cand("a"), taste, now) > score(cand("a", { publishedAt: new Date(now.getTime() - 170 * day) }), taste, now));
    assert.ok(score(cand("a", { coLiked: true }), taste, now) > score(cand("a"), taste, now));
  });

  it("drops candidates with no affinity and orders the rest deterministically", () => {
    const ranked = rank([cand("z", { genre: "jazz" }), cand("b"), cand("a")], taste, now);
    assert.deepEqual(ranked.map((c) => c.id), ["a", "b"]);
  });
});

describe("diversify", () => {
  it("allows at most two tracks per creator", () => {
    const items = ["1", "2", "3", "4", "5"].map((id) => ({ id, creatorId: id <= "3" ? "same" : id }));
    assert.deepEqual(diversify(items, 10).map((i) => i.id), ["1", "2", "4", "5"]);
    assert.equal(diversify(items, 2).length, 2);
  });
});

describe("jaccard", () => {
  it("is 0 for disjoint, 1 for equal, in between otherwise, case-insensitive", () => {
    assert.equal(jaccard(["a"], ["b"]), 0);
    assert.equal(jaccard(["A", "b"], ["a", "B"]), 1);
    assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
    assert.equal(jaccard([], []), 0);
  });
});
