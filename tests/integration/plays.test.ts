import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  PLAY_DEDUPE_WINDOW_MS,
  recordPlay,
} from "@/server/modules/tracks/plays";

import { cleanup, createCollection, createTrack, createUser, db, freezeClock, resetClock } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

async function newTrack() {
  const owner = await createUser("plays");
  const track = await createTrack(owner, { title: "t" });
  return { id: track.id, owner };
}

const count = async (trackId: string) =>
  (await db.track.findUniqueOrThrow({ where: { id: trackId } })).playCount;

describe("recordPlay", () => {
  it("counts a first play and ignores repeats from the same anonymous client", async () => {
    const { id: trackId } = await newTrack();
    const input = { trackId, listenerId: null, clientHash: "client-a" };
    assert.equal(await recordPlay(db, input), true);
    assert.equal(await recordPlay(db, input), false);
    assert.equal(await count(trackId), 1);
    assert.equal(await db.playEvent.count({ where: { trackId } }), 1);
  });

  it("counts distinct anonymous clients separately", async () => {
    const { id: trackId } = await newTrack();
    await recordPlay(db, { trackId, listenerId: null, clientHash: "client-a" });
    await recordPlay(db, { trackId, listenerId: null, clientHash: "client-b" });
    assert.equal(await count(trackId), 2);
  });

  it("dedupes signed-in listeners by account even if their client hash changes", async () => {
    const { id: trackId } = await newTrack();
    const listenerId = await createUser("listener");
    assert.equal(await recordPlay(db, { trackId, listenerId, clientHash: "phone" }), true);
    assert.equal(await recordPlay(db, { trackId, listenerId, clientHash: "laptop" }), false);
    assert.equal(await count(trackId), 1);
  });

  it("counts again once the dedupe window has passed", async () => {
    const { id: trackId } = await newTrack();
    const input = { trackId, listenerId: null, clientHash: "client-a" };
    const start = new Date();
    await recordPlay(db, { ...input, now: start });
    const later = new Date(start.getTime() + PLAY_DEDUPE_WINDOW_MS + 1_000);
    assert.equal(await recordPlay(db, { ...input, now: later }), true);
    assert.equal(await count(trackId), 2);
  });

  it("counts only one of many concurrent requests", async () => {
    // Repeated rounds with high fan-out: a missing lock lets several requests pass
    // the "recent play" check together, which a single small burst can miss.
    for (let round = 0; round < 5; round++) {
      const { id: trackId } = await newTrack();
      const input = { trackId, listenerId: null, clientHash: `burst-${round}` };
      const results = await Promise.all(
        Array.from({ length: 40 }, () => recordPlay(db, input)),
      );
      assert.equal(results.filter(Boolean).length, 1, `round ${round}`);
      assert.equal(await count(trackId), 1);
      assert.equal(await db.playEvent.count({ where: { trackId } }), 1);
    }
  });

  it("does not store raw identifiers for signed-in listeners", async () => {
    const { id: trackId } = await newTrack();
    const listenerId = await createUser("privacy");
    await recordPlay(db, { trackId, listenerId, clientHash: "should-not-persist" });
    const event = await db.playEvent.findFirstOrThrow({ where: { trackId } });
    assert.equal(event.clientHash, null);
    assert.equal(event.listenerId, listenerId);
  });
});

describe("recordPlay: owner, sources, collections, statistics", () => {
  it("PL-P9: the owner's own plays are stored for history but never counted", async () => {
    const { id: trackId, owner } = await newTrack();
    assert.equal(await recordPlay(db, { trackId, listenerId: owner, clientHash: "x" }), false);
    assert.equal(await count(trackId), 0);
    const event = await db.playEvent.findFirstOrThrow({ where: { trackId } });
    assert.equal(event.counted, false);
    assert.equal(await db.trackDailyStat.count({ where: { trackId } }), 0);
  });

  it("records the source and country, and feeds today's daily statistic (IN-6)", async () => {
    const { id: trackId } = await newTrack();
    await recordPlay(db, { trackId, listenerId: null, clientHash: "a", source: "SEARCH", countryCode: "TR" });
    await recordPlay(db, { trackId, listenerId: null, clientHash: "b" });
    const [event] = await db.playEvent.findMany({ where: { trackId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual([event?.source, event?.countryCode, event?.counted], ["SEARCH", "TR", true]);
    const stat = await db.trackDailyStat.findFirstOrThrow({ where: { trackId } });
    assert.equal(stat.plays, 2);
  });

  it("CO-5: a collection is credited only when it really contains the track", async () => {
    const { id: trackId, owner } = await newTrack();
    const inside = await createCollection(owner, { title: "in", trackIds: [trackId] });
    const outside = await createCollection(owner, { title: "out", trackIds: [] });
    await recordPlay(db, { trackId, listenerId: null, clientHash: "a", collectionId: inside.id, source: "COLLECTION" });
    await recordPlay(db, { trackId, listenerId: null, clientHash: "b", collectionId: outside.id });
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: inside.id } })).playCount, 1);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: outside.id } })).playCount, 0);
    assert.equal(await count(trackId), 2);
  });

  it("uses the injectable clock for the dedupe window and the daily bucket", async () => {
    const { id: trackId } = await newTrack();
    const input = { trackId, listenerId: null, clientHash: "clock" };
    freezeClock(new Date("2030-01-01T10:00:00Z"));
    try {
      assert.equal(await recordPlay(db, input), true);
      assert.equal(await recordPlay(db, input), false);
    } finally {
      resetClock();
    }
    const stat = await db.trackDailyStat.findFirstOrThrow({ where: { trackId } });
    assert.equal(stat.day.toISOString().slice(0, 10), "2030-01-01");
  });
});
