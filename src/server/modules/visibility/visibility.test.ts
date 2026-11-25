import assert from "node:assert/strict";
import test from "node:test";

import {
  accessibleTrackWhere,
  canAccessTrack,
  collectionAccess,
  effectiveVisibility,
  publicTrackWhere,
  tokensMatch,
  type CollectionAccessRow,
  type TrackAccessRow,
} from "./index";

const NOW = new Date("2030-06-01T12:00:00Z");
const earlier = new Date("2030-06-01T11:00:00Z");
const later = new Date("2030-06-02T12:00:00Z");

const track = (overrides: Partial<TrackAccessRow> = {}): TrackAccessRow => ({
  creatorId: "owner",
  visibility: "PUBLIC",
  publishAt: null,
  moderationState: "VISIBLE",
  secretToken: "s".repeat(22),
  creator: { status: "ACTIVE" },
  ...overrides,
});

const collection = (overrides: Partial<CollectionAccessRow> = {}): CollectionAccessRow => ({
  ownerId: "owner",
  visibility: "PRIVATE",
  moderationState: "VISIBLE",
  secretToken: "c".repeat(22),
  owner: { status: "ACTIVE" },
  ...overrides,
});

test("effectiveVisibility: SCHEDULED flips at read time, J8", () => {
  assert.equal(effectiveVisibility({ visibility: "PUBLIC" }, NOW), "PUBLIC");
  assert.equal(effectiveVisibility({ visibility: "PRIVATE" }, NOW), "PRIVATE");
  assert.equal(effectiveVisibility({ visibility: "SCHEDULED", publishAt: later }, NOW), "PRIVATE");
  assert.equal(effectiveVisibility({ visibility: "SCHEDULED", publishAt: NOW }, NOW), "PUBLIC");
  assert.equal(effectiveVisibility({ visibility: "SCHEDULED", publishAt: earlier }, NOW), "PUBLIC");
  assert.equal(effectiveVisibility({ visibility: "SCHEDULED", publishAt: null }, NOW), "PRIVATE");
});

test("7.7 matrix: public tracks are open to everyone", () => {
  assert.ok(canAccessTrack(track(), { now: NOW }));
  assert.ok(canAccessTrack(track({ visibility: "SCHEDULED", publishAt: earlier }), { now: NOW }));
});

test("7.7 matrix: private tracks need the owner or the secret token (J7)", () => {
  const priv = track({ visibility: "PRIVATE" });
  assert.equal(canAccessTrack(priv, { now: NOW }), false);
  assert.equal(canAccessTrack(priv, { now: NOW, viewerId: "stranger" }), false);
  assert.equal(canAccessTrack(priv, { now: NOW, viewerId: "owner" }), true);
  assert.equal(canAccessTrack(priv, { now: NOW, secret: priv.secretToken }), true);
  assert.equal(canAccessTrack(priv, { now: NOW, secret: "x".repeat(22) }), false);
  assert.equal(canAccessTrack(priv, { now: NOW, secret: "short" }), false);
  assert.equal(canAccessTrack(track({ visibility: "SCHEDULED", publishAt: later }), { now: NOW }), false);
});

test("7.7 matrix: a collection secret opens the owner's private tracks only", () => {
  const priv = track({ visibility: "PRIVATE" });
  const set = collection();
  const via = { row: set, secret: set.secretToken };
  assert.equal(canAccessTrack(priv, { now: NOW, viaCollection: via }), true);
  assert.equal(canAccessTrack(priv, { now: NOW, viaCollection: { row: set, secret: "nope" } }), false);
  // someone else's track inside the collection stays private
  assert.equal(
    canAccessTrack(track({ visibility: "PRIVATE", creatorId: "other" }), { now: NOW, viaCollection: via }),
    false,
  );
});

test("moderation and account status hide content from everyone but the owner (removed) ", () => {
  const removed = track({ moderationState: "REMOVED" });
  assert.equal(canAccessTrack(removed, { now: NOW }), false);
  assert.equal(canAccessTrack(removed, { now: NOW, secret: removed.secretToken }), false);
  assert.equal(canAccessTrack(removed, { now: NOW, viewerId: "owner" }), true);
  for (const status of ["SUSPENDED", "DELETED"] as const) {
    const t = track({ creator: { status } });
    assert.equal(canAccessTrack(t, { now: NOW }), false);
    assert.equal(canAccessTrack(t, { now: NOW, viewerId: "owner" }), false);
  }
});

test("collectionAccess follows the same rules", () => {
  assert.equal(collectionAccess(collection({ visibility: "PUBLIC" }), {}), "public");
  assert.equal(collectionAccess(collection(), {}), null);
  assert.equal(collectionAccess(collection(), { viewerId: "owner" }), "owner");
  assert.equal(collectionAccess(collection(), { secret: "c".repeat(22) }), "secret");
  assert.equal(collectionAccess(collection({ visibility: "PUBLIC", moderationState: "REMOVED" }), {}), null);
});

test("tokensMatch is length-safe", () => {
  assert.ok(tokensMatch("abc", "abc"));
  assert.ok(!tokensMatch("abc", "abd"));
  assert.ok(!tokensMatch("abc", "abcd"));
  assert.ok(!tokensMatch("abc", null));
  assert.ok(!tokensMatch("abc", ""));
});

test("where builders: public excludes private/removed/inactive owners; viewers add their own", () => {
  const pub = publicTrackWhere(NOW);
  assert.deepEqual(pub, {
    moderationState: "VISIBLE",
    creator: { status: "ACTIVE" },
    OR: [{ visibility: "PUBLIC" }, { visibility: "SCHEDULED", publishAt: { lte: NOW } }],
  });
  assert.deepEqual(accessibleTrackWhere(null, NOW), pub);
  assert.deepEqual(accessibleTrackWhere("u1", NOW), { OR: [pub, { creatorId: "u1" }] });
});
