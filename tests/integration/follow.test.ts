import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { setFollow } from "@/server/modules/social/follow";

import { callerFor, cleanup, createUser, db, freezeClock, resetClock, resetRateLimits, withAppCode,
} from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

/** The invariant: both counters equal the rows they summarise. */
async function assertConsistent(...userIds: string[]) {
  for (const id of userIds) {
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    assert.equal(user.followerCount, await db.follow.count({ where: { followingId: id } }), `followerCount of ${id}`);
    assert.equal(user.followingCount, await db.follow.count({ where: { followerId: id } }), `followingCount of ${id}`);
  }
}

describe("engagement.setFollow (FO-1, FO-2)", () => {
  it("follows once however often it is repeated, and unfollows cleanly", async () => {
    const [fan, creator] = await Promise.all([createUser("fan"), createUser("creator")]);
    const api = callerFor(fan).engagement;
    assert.deepEqual(await api.setFollow({ userId: creator, follow: true }), { following: true, followerCount: 1 });
    assert.deepEqual(await api.setFollow({ userId: creator, follow: true }), { following: true, followerCount: 1 });
    await assertConsistent(fan, creator);
    assert.deepEqual(await api.setFollow({ userId: creator, follow: false }), { following: false, followerCount: 0 });
    assert.deepEqual(await api.setFollow({ userId: creator, follow: false }), { following: false, followerCount: 0 });
    await assertConsistent(fan, creator);
  });

  it("stays consistent under concurrent requests, from one follower and from a crowd", async () => {
    const creator = await createUser("burst-creator");
    const fan = await createUser("burst-fan");
    await Promise.all(Array.from({ length: 20 }, () => callerFor(fan).engagement.setFollow({ userId: creator, follow: true })));
    await assertConsistent(fan, creator);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: creator } })).followerCount, 1);

    const crowd = await Promise.all(Array.from({ length: 12 }, (_, i) => createUser(`crowd-${i}`)));
    await Promise.all(crowd.map((id) => callerFor(id).engagement.setFollow({ userId: creator, follow: true })));
    await assertConsistent(creator, ...crowd);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: creator } })).followerCount, 13);

    await Promise.allSettled(Array.from({ length: 30 }, (_, i) => callerFor(fan).engagement.setFollow({ userId: creator, follow: i % 2 === 0 })));
    await assertConsistent(fan, creator);
  });

  it("refuses self-follow, unknown, suspended and deleted targets, and anonymous callers", async () => {
    const me = await createUser("me");
    await assert.rejects(callerFor(me).engagement.setFollow({ userId: me, follow: true }), { code: "BAD_REQUEST" });
    await assert.rejects(callerFor(me).engagement.setFollow({ userId: crypto.randomUUID(), follow: true }), { code: "NOT_FOUND" });
    for (const status of ["SUSPENDED", "DELETED"] as const) {
      const target = await createUser(`gone-${status}`, { status });
      await assert.rejects(callerFor(me).engagement.setFollow({ userId: target, follow: true }), { code: "NOT_FOUND" });
    }
    await assert.rejects(callerFor().engagement.setFollow({ userId: me, follow: true }), { code: "UNAUTHORIZED" });
    await assertConsistent(me);
  });

  it("BL-1: nobody can follow someone who blocked them, or whom they blocked", async () => {
    const [a, b] = await Promise.all([createUser("blocker"), createUser("blocked")]);
    await db.block.create({ data: { blockerId: a, blockedId: b } });
    await assert.rejects(callerFor(b).engagement.setFollow({ userId: a, follow: true }), withAppCode("BLOCKED"));
    await assert.rejects(callerFor(a).engagement.setFollow({ userId: b, follow: true }), withAppCode("BLOCKED"));
    await assertConsistent(a, b);
  });

  it("IN-6: new and lost followers are counted per day", async () => {
    const [fan, creator] = await Promise.all([createUser("stat-fan"), createUser("stat-creator")]);
    await callerFor(fan).engagement.setFollow({ userId: creator, follow: true });
    await callerFor(fan).engagement.setFollow({ userId: creator, follow: false });
    const stat = await db.userDailyStat.findFirstOrThrow({ where: { userId: creator } });
    assert.deepEqual([stat.newFollowers, stat.lostFollowers], [1, 1]);
  });

  it("14.3: more than 60 follow changes a minute are rate limited, and a rejected one leaves nothing behind", async () => {
    const fan = await createUser("rl-fan");
    const targets = await Promise.all(Array.from({ length: 61 }, (_, i) => createUser(`rl-${i}`)));
    freezeClock(new Date("2030-03-03T10:00:30Z"));
    try {
      const at = new Date("2030-03-03T10:00:30Z");
      for (const target of targets.slice(0, 60)) await setFollow(db, { followerId: fan, followingId: target, follow: true, now: at });
      await assert.rejects(setFollow(db, { followerId: fan, followingId: targets[60]!, follow: true, now: at }), { code: "TOO_MANY_REQUESTS" });
      assert.equal(await db.follow.count({ where: { followerId: fan } }), 60);
      await assertConsistent(fan, targets[60]!);
      // the next minute is a new window
      await setFollow(db, { followerId: fan, followingId: targets[60]!, follow: true, now: new Date("2030-03-03T10:01:05Z") });
      assert.equal(await db.follow.count({ where: { followerId: fan } }), 61);
    } finally {
      resetClock();
    }
  });
});
