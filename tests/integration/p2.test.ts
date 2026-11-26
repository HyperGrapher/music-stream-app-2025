import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { clearChartCache } from "@/server/modules/charts";

import { callerFor, cleanup, createTrack, createUser, db, resetRateLimits } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe("chart rank change (CH-2)", () => {
  it("compares with the same chart as of yesterday and marks new entries", async () => {
    clearChartCache();
    const owner = await createUser("chart-owner");
    const genre = `genre-${crypto.randomUUID().slice(0, 6)}`;
    const [a, b, c] = await Promise.all(["A", "B", "C"].map((title) => createTrack(owner, { title, genre })));
    await db.trackDailyStat.createMany({
      data: [
        { trackId: a!.id, day: daysAgo(1), plays: 10 },
        { trackId: b!.id, day: daysAgo(1), plays: 5 },
        { trackId: b!.id, day: daysAgo(0), plays: 20 },
        { trackId: c!.id, day: daysAgo(0), plays: 3 },
      ],
    });
    const chart = await callerFor().charts.top({ genre });
    assert.deepEqual(chart.map((e) => [e.track.title, e.rank, e.change]), [["B", 1, 1], ["A", 2, -1], ["C", 3, null]]);
    const hot = await callerFor().charts.newAndHot({ genre });
    assert.ok(hot.every((e) => e.change === undefined), "New & Hot has no rank change");
  });
});

describe("@mention suggestions (CM-4)", () => {
  it("lists people you follow first, then others, never yourself or blocked people", async () => {
    const me = await createUser("mn-me");
    const prefix = `mnx${crypto.randomUUID().slice(0, 4)}`;
    const make = async (suffix: string) => {
      const id = await createUser(`${prefix}-${suffix}`);
      await db.user.update({ where: { id }, data: { username: `${prefix}${suffix}` } });
      return id;
    };
    const [zed, , blocked] = [await make("zed"), await make("amy"), await make("bad")];
    await callerFor(me).engagement.setFollow({ userId: zed, follow: true });
    await callerFor(me).trust.setBlock({ userId: blocked, blocked: true });
    const list = await callerFor(me).search.mentions({ q: prefix });
    assert.deepEqual(list.map((p) => [p.username, p.following]), [[`${prefix}zed`, true], [`${prefix}amy`, false]]);
    assert.ok(!list.some((p) => p.id === me || p.id === blocked));
    await assert.rejects(callerFor().search.mentions({ q: "a" }), /UNAUTHORIZED/);
  });
});

describe("repost captions (RP-1)", () => {
  it("a caption travels with the repost into the follower's feed", async () => {
    const [creator, fan, follower] = [await createUser("cap-c"), await createUser("cap-f"), await createUser("cap-w")];
    const track = await createTrack(creator, { title: "Captioned" });
    await callerFor(follower).engagement.setFollow({ userId: fan, follow: true });
    await callerFor(fan).engagement.setTrackRepost({ trackId: track.id, reposted: true, caption: "  you need this  " });
    const feed = await callerFor(follower).feed.list({ tab: "reposts" });
    assert.equal(feed.items[0]?.verb, "reposted");
    assert.equal(feed.items[0]?.caption, "you need this");
  });
});

describe("Your mixes (P2)", () => {
  it("builds one queue per favourite genre from public tracks, without own or blocked tracks", async () => {
    const [me, other, banned] = [await createUser("mx-me"), await createUser("mx-o"), await createUser("mx-b")];
    const genre = `mixg${crypto.randomUUID().slice(0, 4)}`;
    await db.user.update({ where: { id: me }, data: { favoriteGenres: [genre] } });
    await Promise.all([1, 2, 3].map((n) => createTrack(other, { title: `Other ${n}`, genre })));
    const mine = await createTrack(me, { title: "Mine", genre });
    const theirs = await createTrack(banned, { title: "Banned", genre });
    await createTrack(other, { title: "Private", genre, visibility: "PRIVATE" });
    await callerFor(me).trust.setBlock({ userId: banned, blocked: true });
    const mixes = await callerFor(me).discover.mixes();
    assert.equal(mixes.length, 1);
    assert.equal(mixes[0]!.genre, genre);
    const ids = mixes[0]!.tracks.map((t) => t.id);
    assert.ok(!ids.includes(mine.id) && !ids.includes(theirs.id));
    assert.deepEqual(mixes[0]!.tracks.map((t) => t.title).sort(), ["Other 1", "Other 2", "Other 3"]);
  });
});
