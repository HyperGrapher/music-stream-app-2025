import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { callerFor, cleanup, createCollection, createTrack, createUser, db, resetRateLimits, withAppCode } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const makePro = (id: string) => db.user.update({ where: { id }, data: { plan: "PRO" } });
const day = (offset = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

describe("studio tables", () => {
  it("lists only your tracks of every visibility with filters, search and sorting", async () => {
    const me = await createUser("st-me");
    const other = await createUser("st-other");
    const pub = await createTrack(me, { title: "Alpha public", playCount: 5 });
    const priv = await createTrack(me, { title: "Beta private", visibility: "PRIVATE", playCount: 9 });
    await createTrack(other, { title: "Not mine" });
    const api = callerFor(me).studio;

    const all = await api.tracks({});
    assert.deepEqual(all.items.map((t) => t.id).sort(), [pub.id, priv.id].sort());
    assert.deepEqual((await api.tracks({ visibility: "private" })).items.map((t) => t.id), [priv.id]);
    assert.deepEqual((await api.tracks({ q: "alpha" })).items.map((t) => t.id), [pub.id]);
    assert.deepEqual((await api.tracks({ sort: "playCount", dir: "desc" })).items.map((t) => t.id), [priv.id, pub.id]);
    assert.equal(all.items.find((t) => t.id === priv.id)?.state, "private");
    assert.ok(all.items.find((t) => t.id === priv.id)?.secretToken);
  });
});

describe("bulk edit and delete", () => {
  it("applies tags (add/remove/replace), genre, privacy and permissions, previews the count, and ignores other people's tracks", async () => {
    const me = await createUser("bulk-me");
    const stranger = await createUser("bulk-stranger");
    const a = await createTrack(me, { title: "a", tags: ["one"], genre: "rock" });
    const b = await createTrack(me, { title: "b", tags: ["one", "two"], genre: "rock" });
    const theirs = await createTrack(stranger, { title: "theirs", genre: "rock" });
    const api = callerFor(me).studio;

    assert.deepEqual(await api.bulkPreview({ ids: [a.id, b.id], patch: { genre: "rock" } }), { selected: 2, changes: 0 });
    assert.deepEqual(await api.bulkPreview({ ids: [a.id, b.id], patch: { tags: { mode: "add", values: ["two"] } } }), { selected: 2, changes: 1 });

    await api.bulkUpdate({ ids: [a.id, b.id, theirs.id], patch: { tags: { mode: "add", values: ["two", "new"] }, genre: "jazz-blues", downloadable: true, privacy: "private" } });
    const rows = await db.track.findMany({ where: { id: { in: [a.id, b.id, theirs.id] } }, orderBy: { title: "asc" } });
    assert.deepEqual(rows[0]!.tags.sort(), ["new", "one", "two"]);
    assert.deepEqual(rows[1]!.tags.sort(), ["new", "one", "two"]);
    assert.equal(rows[0]!.genre, "jazz-blues");
    assert.equal(rows[0]!.downloadable, true);
    assert.equal(rows[0]!.visibility, "PRIVATE");
    assert.equal(rows[2]!.genre, "rock", "someone else's track is untouched");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: me } })).publicTrackCount, 0, "public count recomputed");

    await api.bulkUpdate({ ids: [a.id], patch: { tags: { mode: "remove", values: ["new"] } } });
    await api.bulkUpdate({ ids: [b.id], patch: { tags: { mode: "replace", values: ["only"] } } });
    assert.deepEqual((await db.track.findUniqueOrThrow({ where: { id: a.id } })).tags.sort(), ["one", "two"]);
    assert.deepEqual((await db.track.findUniqueOrThrow({ where: { id: b.id } })).tags, ["only"]);
  });

  it("Quiet Mode (hiding stats) in bulk needs Pro; scheduling is not offered in bulk", async () => {
    const me = await createUser("bulk-quiet");
    const t = await createTrack(me, { title: "q" });
    await assert.rejects(callerFor(me).studio.bulkUpdate({ ids: [t.id], patch: { statsPublic: false } }), withAppCode("PLAN_REQUIRED"));
    await makePro(me);
    await callerFor(me).studio.bulkUpdate({ ids: [t.id], patch: { statsPublic: false } });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: t.id } })).statsPublic, false);
  });

  it("bulk add to a new playlist and bulk delete with typed confirmation above 5 tracks", async () => {
    const me = await createUser("bulk-del");
    const tracks = await Promise.all(Array.from({ length: 7 }, (_, i) => createTrack(me, { title: `t${i}` })));
    const ids = tracks.map((t) => t.id);
    const playlist = await callerFor(me).collections.createPlaylist({ title: "All of them", trackIds: ids });
    assert.equal(playlist.added, 7);

    await assert.rejects(callerFor(me).studio.bulkDelete({ ids }), /DELETE/);
    assert.equal(await db.track.count({ where: { id: { in: ids } } }), 7);
    assert.deepEqual(await callerFor(me).studio.bulkDelete({ ids, confirmation: "DELETE" }), { deleted: 7 });
    assert.equal(await db.track.count({ where: { id: { in: ids } } }), 0);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: playlist.id } })).trackCount, 0, "playlist renumbered");
    // few tracks need no typing
    const one = await createTrack(me, { title: "one" });
    assert.deepEqual(await callerFor(me).studio.bulkDelete({ ids: [one.id] }), { deleted: 1 });
  });

  it("lists collections with stats", async () => {
    const me = await createUser("st-sets");
    await createCollection(me, { title: "Mine", type: "ALBUM" });
    const sets = await callerFor(me).studio.collections({});
    assert.equal(sets.items.length, 1);
    assert.equal(sets.items[0]?.title, "Mine");
  });
});

describe("insights", () => {
  async function seed() {
    const me = await createUser("in-me");
    const fan = await createUser("in-fan");
    const hidden = await createUser("in-hidden");
    await db.user.update({ where: { id: hidden }, data: { showInTopListeners: false } });
    const t1 = await createTrack(me, { title: "Hit" });
    const t2 = await createTrack(me, { title: "Deep cut" });
    await db.trackDailyStat.createMany({ data: [
      { trackId: t1.id, day: day(0), plays: 5, likes: 2, downloads: 1 },
      { trackId: t1.id, day: day(-1), plays: 3 },
      { trackId: t2.id, day: day(-2), plays: 1 },
      { trackId: t1.id, day: day(-10), plays: 7 },
    ] });
    await db.userDailyStat.create({ data: { userId: me, day: day(0), newFollowers: 4 } });
    const ev = (over: object) => ({ trackId: t1.id, clientHash: "h", ...over });
    await db.playEvent.createMany({ data: [
      ev({ listenerId: fan, clientHash: null, countryCode: "TR", source: "HOME", completed: true }),
      ev({ listenerId: fan, clientHash: null, countryCode: "TR", source: "SEARCH" }),
      ev({ listenerId: hidden, clientHash: null, countryCode: "DE", source: "FEED" }),
      ev({ countryCode: null, source: "EMBED" }),
      ev({ listenerId: me, clientHash: null, counted: false, countryCode: "US", source: "PROFILE" }),
    ] });
    return { me, fan, hidden, t1, t2 };
  }

  it("Free: 7-day range, totals with change vs the previous period, plays over time, top tracks; no breakdowns", async () => {
    const { me, t1 } = await seed();
    const result = await callerFor(me).insights.get({ range: "7" });
    assert.deepEqual(result.totals, { plays: 9, likes: 2, reposts: 0, comments: 0, downloads: 1, newFollowers: 4 });
    assert.equal(result.previous?.plays, 7, "previous 7 days");
    assert.equal(result.series.length, 7);
    assert.equal(result.series.at(-1)?.plays, 5);
    assert.equal(result.topTracks[0]?.id, t1.id);
    assert.equal(result.topTracks[0]?.completionRate, 1 / 4, "1 of 4 counted events completed; the owner's own play is excluded");
    assert.equal(result.breakdowns, null);
    const all = await callerFor(me).insights.get({ range: "all" });
    assert.equal(all.totals.plays, 16);
    assert.equal(all.previous, null);
  });

  it("Free is refused longer ranges and the per-track drill-down with PLAN_REQUIRED", async () => {
    const { me, t1 } = await seed();
    await assert.rejects(callerFor(me).insights.get({ range: "30" }), withAppCode("PLAN_REQUIRED"));
    await assert.rejects(callerFor(me).insights.get({ range: "7", trackId: t1.id }), withAppCode("PLAN_REQUIRED"));
  });

  it("Pro: all ranges, countries, sources and top listeners (respecting the privacy toggle), per-track drill-down", async () => {
    const { me, fan, t1, t2 } = await seed();
    await makePro(me);
    const api = callerFor(me).insights;
    const result = await api.get({ range: "30" });
    assert.equal(result.totals.plays, 16);
    assert.deepEqual(result.breakdowns?.countries.map((c) => [c.country, c.plays]).sort(), [["DE", 1], ["TR", 2], ["Unknown", 1]]);
    assert.deepEqual(Object.fromEntries(result.breakdowns!.sources.map((s) => [s.source, s.plays])), { HOME: 1, SEARCH: 1, FEED: 1, EMBED: 1 });
    assert.deepEqual(result.breakdowns?.listeners.map((l) => [l.id, l.plays]), [[fan, 2]], "the user who hides from top listeners is left out");
    assert.equal((await api.get({ range: "365" })).weekly, true);
    const single = await api.get({ range: "30", trackId: t2.id });
    assert.equal(single.totals.plays, 1);
    assert.equal(single.breakdowns?.countries.length, 0);
    await assert.rejects(api.get({ range: "7", trackId: "00000000-0000-4000-8000-000000000000" }), /not found/i);
    assert.ok(t1);
  });
});
