import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createUser, db } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

async function newTrack(visibility: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PUBLIC") {
  const owner = await createUser("likes-owner");
  const asset = await createAsset(owner, { status: "ATTACHED" });
  const track = await db.track.create({
    data: { creatorId: owner, audioAssetId: asset.id, title: "liked", visibility },
  });
  return { owner, trackId: track.id };
}

/** The invariant the whole feature rests on: the counter equals the rows it summarises. */
async function assertConsistent(trackId: string, expected: number) {
  const track = await db.track.findUniqueOrThrow({ where: { id: trackId } });
  assert.equal(track.likeCount, expected, "likeCount");
  assert.equal(await db.trackLike.count({ where: { trackId } }), expected, "TrackLike rows");
}

describe("engagement.setTrackLike", () => {
  it("likes once however often it is repeated, and unlikes cleanly", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("fan");
    const api = callerFor(fan).engagement;

    assert.deepEqual(await api.setTrackLike({ trackId, liked: true }), { liked: true, likeCount: 1 });
    assert.deepEqual(await api.setTrackLike({ trackId, liked: true }), { liked: true, likeCount: 1 });
    await assertConsistent(trackId, 1);

    assert.deepEqual(await api.setTrackLike({ trackId, liked: false }), { liked: false, likeCount: 0 });
    assert.deepEqual(await api.setTrackLike({ trackId, liked: false }), { liked: false, likeCount: 0 });
    await assertConsistent(trackId, 0);
  });

  it("counts different listeners separately", async () => {
    const { trackId } = await newTrack();
    const [a, b, c] = await Promise.all(["a", "b", "c"].map((n) => createUser(`fan-${n}`)));
    for (const user of [a, b, c]) await callerFor(user).engagement.setTrackLike({ trackId, liked: true });
    await assertConsistent(trackId, 3);
    await callerFor(b).engagement.setTrackLike({ trackId, liked: false });
    await assertConsistent(trackId, 2);
  });

  it("stays consistent under concurrent requests", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("burst-fan");
    // The same listener hammering the button...
    await Promise.all(
      Array.from({ length: 20 }, () => callerFor(fan).engagement.setTrackLike({ trackId, liked: true })),
    );
    await assertConsistent(trackId, 1);

    // ...and many listeners liking at once.
    const crowd = await Promise.all(Array.from({ length: 12 }, (_, i) => createUser(`crowd-${i}`)));
    await Promise.all(
      crowd.map((user) => callerFor(user).engagement.setTrackLike({ trackId, liked: true })),
    );
    await assertConsistent(trackId, 13);

    // Mixed like / unlike storm from one listener: whatever order wins, counter == rows.
    await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        callerFor(fan).engagement.setTrackLike({ trackId, liked: i % 2 === 0 }),
      ),
    );
    const rows = await db.trackLike.count({ where: { trackId } });
    await assertConsistent(trackId, rows);
  });

  it("requires a signed-in user", async () => {
    const { trackId } = await newTrack();
    await assert.rejects(callerFor().engagement.setTrackLike({ trackId, liked: true }), { code: "UNAUTHORIZED" });
    await assertConsistent(trackId, 0);
  });

  it("works on unlisted tracks, and hides private ones from everyone but the owner", async () => {
    const unlisted = await newTrack("UNLISTED");
    const fan = await createUser("unlisted-fan");
    await callerFor(fan).engagement.setTrackLike({ trackId: unlisted.trackId, liked: true });
    await assertConsistent(unlisted.trackId, 1);

    const priv = await newTrack("PRIVATE");
    await assert.rejects(
      callerFor(fan).engagement.setTrackLike({ trackId: priv.trackId, liked: true }),
      { code: "NOT_FOUND" },
    );
    await assertConsistent(priv.trackId, 0);
    await callerFor(priv.owner).engagement.setTrackLike({ trackId: priv.trackId, liked: true });
    await assertConsistent(priv.trackId, 1);
  });

  it("rejects unknown tracks and malformed ids", async () => {
    const fan = await createUser("nowhere-fan");
    await assert.rejects(
      callerFor(fan).engagement.setTrackLike({ trackId: crypto.randomUUID(), liked: true }),
      { code: "NOT_FOUND" },
    );
    await assert.rejects(callerFor(fan).engagement.setTrackLike({ trackId: "nope", liked: true }));
  });
});

describe("likedByMe", () => {
  it("is true only for the listener who liked, across the queries the UI uses", async () => {
    const { owner, trackId } = await newTrack();
    const fan = await createUser("liker");
    const other = await createUser("bystander");
    await callerFor(fan).engagement.setTrackLike({ trackId, liked: true });

    const seen = async (viewer?: string) => {
      const api = callerFor(viewer);
      const detail = await api.artist.getTrack({ trackId });
      const latest = await api.artist.getLatestTracks({ artist: owner });
      const popular = await api.artist.getPopularTracks({ artist: owner });
      return [detail?.likedByMe, latest[0]?.likedByMe, popular[0]?.likedByMe];
    };

    assert.deepEqual(await seen(fan), [true, true, true]);
    assert.deepEqual(await seen(other), [false, false, false]);
    assert.deepEqual(await seen(undefined), [false, false, false]);

    await callerFor(fan).engagement.setTrackLike({ trackId, liked: false });
    assert.deepEqual(await seen(fan), [false, false, false]);
  });
});
