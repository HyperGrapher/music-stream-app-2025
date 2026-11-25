import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  PLAY_DEDUPE_WINDOW_MS,
  recordPlay,
} from "@/server/modules/tracks/plays";

import { cleanup, createAsset, createUser, db } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

async function newTrack() {
  const owner = await createUser("plays");
  const asset = await createAsset(owner, { status: "ATTACHED" });
  const track = await db.track.create({
    data: { creatorId: owner, audioAssetId: asset.id, title: "t" },
  });
  return track.id;
}

const count = async (trackId: string) =>
  (await db.track.findUniqueOrThrow({ where: { id: trackId } })).playCount;

describe("recordPlay", () => {
  it("counts a first play and ignores repeats from the same anonymous client", async () => {
    const trackId = await newTrack();
    const input = { trackId, listenerId: null, clientHash: "client-a" };
    assert.equal(await recordPlay(db, input), true);
    assert.equal(await recordPlay(db, input), false);
    assert.equal(await count(trackId), 1);
    assert.equal(await db.playEvent.count({ where: { trackId } }), 1);
  });

  it("counts distinct anonymous clients separately", async () => {
    const trackId = await newTrack();
    await recordPlay(db, { trackId, listenerId: null, clientHash: "client-a" });
    await recordPlay(db, { trackId, listenerId: null, clientHash: "client-b" });
    assert.equal(await count(trackId), 2);
  });

  it("dedupes signed-in listeners by account even if their client hash changes", async () => {
    const trackId = await newTrack();
    const listenerId = await createUser("listener");
    assert.equal(await recordPlay(db, { trackId, listenerId, clientHash: "phone" }), true);
    assert.equal(await recordPlay(db, { trackId, listenerId, clientHash: "laptop" }), false);
    assert.equal(await count(trackId), 1);
  });

  it("counts again once the dedupe window has passed", async () => {
    const trackId = await newTrack();
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
      const trackId = await newTrack();
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
    const trackId = await newTrack();
    const listenerId = await createUser("privacy");
    await recordPlay(db, { trackId, listenerId, clientHash: "should-not-persist" });
    const event = await db.playEvent.findFirstOrThrow({ where: { trackId } });
    assert.equal(event.clientHash, null);
    assert.equal(event.listenerId, listenerId);
  });
});
