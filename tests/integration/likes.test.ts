import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  callerFor,
  cleanup,
  createTrack,
  createUser,
  db,
  freezeClock,
  resetClock,
  resetRateLimits,
  usernameOf,
} from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

async function newTrack(visibility: "PUBLIC" | "PRIVATE" = "PUBLIC") {
  const owner = await createUser("likes-owner");
  const track = await createTrack(owner, { title: "liked", visibility });
  return { owner, trackId: track.id, track };
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

    // Mixed like / unlike storm from one listener: whatever order wins (and whatever the rate
    // limit rejects), counter == rows.
    await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        callerFor(fan).engagement.setTrackLike({ trackId, liked: i % 2 === 0 }),
      ),
    );
    await assertConsistent(trackId, await db.trackLike.count({ where: { trackId } }));
  });

  it("requires a signed-in user", async () => {
    const { trackId } = await newTrack();
    await assert.rejects(callerFor().engagement.setTrackLike({ trackId, liked: true }), { code: "UNAUTHORIZED" });
    await assertConsistent(trackId, 0);
  });

  it("VI-2: nobody can like their own track", async () => {
    const { owner, trackId } = await newTrack();
    await assert.rejects(callerFor(owner).engagement.setTrackLike({ trackId, liked: true }), { code: "BAD_REQUEST" });
    await assertConsistent(trackId, 0);
  });

  it("hides private tracks, and refuses to like them even through the secret link", async () => {
    const priv = await newTrack("PRIVATE");
    const fan = await createUser("private-fan");
    await assert.rejects(callerFor(fan).engagement.setTrackLike({ trackId: priv.trackId, liked: true }), { code: "NOT_FOUND" });
    await assert.rejects(
      callerFor(fan).engagement.setTrackLike({ trackId: priv.trackId, liked: true, access: { secret: priv.track.secretToken } }),
      { code: "BAD_REQUEST" },
    );
    await assertConsistent(priv.trackId, 0);
  });

  it("rejects unknown tracks and malformed ids", async () => {
    const fan = await createUser("nowhere-fan");
    await assert.rejects(
      callerFor(fan).engagement.setTrackLike({ trackId: crypto.randomUUID(), liked: true }),
      { code: "NOT_FOUND" },
    );
    await assert.rejects(callerFor(fan).engagement.setTrackLike({ trackId: "nope", liked: true }));
  });

  it("LK-3: toggling the same track more than 10 times in 10 minutes is rate limited", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("toggler");
    const api = callerFor(fan).engagement;
    // Each like/unlike pair is two effective toggles: five pairs use the allowance of ten.
    for (let i = 0; i < 5; i++) {
      await api.setTrackLike({ trackId, liked: true });
      await api.setTrackLike({ trackId, liked: false });
    }
    await assert.rejects(api.setTrackLike({ trackId, liked: true }), { code: "TOO_MANY_REQUESTS" });
    await assertConsistent(trackId, 0); // the rejected attempt left no row and no count behind
  });

  it("IN-6: a like adds to today's daily stat, and undoing it the same day takes it back", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("daily");
    const stat = async () => (await db.trackDailyStat.findFirst({ where: { trackId } }))?.likes ?? 0;
    await callerFor(fan).engagement.setTrackLike({ trackId, liked: true });
    assert.equal(await stat(), 1);
    await callerFor(fan).engagement.setTrackLike({ trackId, liked: false });
    assert.equal(await stat(), 0);
  });

  it("IN-6: undoing a like from an earlier day does not rewrite that day's statistics", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("old-like");
    const yesterday = new Date(Date.now() - 36 * 3_600_000);
    freezeClock(yesterday);
    try {
      await callerFor(fan).engagement.setTrackLike({ trackId, liked: true });
    } finally {
      resetClock();
    }
    await callerFor(fan).engagement.setTrackLike({ trackId, liked: false });
    const stats = await db.trackDailyStat.findMany({ where: { trackId } });
    assert.equal(stats.reduce((sum, s) => sum + s.likes, 0), 1, "yesterday keeps its like");
  });
});

describe("likedByMe", () => {
  it("is true only for the listener who liked, across the queries the UI uses", async () => {
    const { owner, trackId, track } = await newTrack();
    const fan = await createUser("liker");
    const other = await createUser("bystander");
    await callerFor(fan).engagement.setTrackLike({ trackId, liked: true });

    const seen = async (viewer?: string) => {
      const api = callerFor(viewer);
      const detail = await api.tracks.byPermalink({ username: usernameOf(owner), slug: track.slug });
      const latest = await api.profiles.tracks({ username: usernameOf(owner), sort: "latest" });
      const popular = await api.profiles.tracks({ username: usernameOf(owner), sort: "popular" });
      return [detail.status === "ok" ? detail.track.likedByMe : null, latest[0]?.likedByMe, popular[0]?.likedByMe];
    };

    assert.deepEqual(await seen(fan), [true, true, true]);
    assert.deepEqual(await seen(other), [false, false, false]);
    assert.deepEqual(await seen(undefined), [false, false, false]);

    await callerFor(fan).engagement.setTrackLike({ trackId, liked: false });
    assert.deepEqual(await seen(fan), [false, false, false]);
  });
});
