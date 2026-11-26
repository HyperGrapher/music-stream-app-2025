import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { callerFor, cleanup, createCollection, createTrack, createUser, db, resetRateLimits, usernameOf, withAppCode } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const makeAdmin = async (label = "admin") => {
  const id = await createUser(label);
  await db.user.update({ where: { id }, data: { role: "ADMIN" } });
  return id;
};
const verify = (...ids: string[]) => db.user.updateMany({ where: { id: { in: ids } }, data: { emailVerified: true } });
const sysNotes = (userId: string) => db.notification.findMany({ where: { recipientId: userId, type: "SYSTEM" }, orderBy: { createdAt: "asc" } });

describe("blocking (BL-1, BL-2)", () => {
  it("removes follows both ways with counters, refuses new follows, lists and unblocks", async () => {
    const a = await createUser("blk-a");
    const b = await createUser("blk-b");
    await callerFor(a).engagement.setFollow({ userId: b, follow: true });
    await callerFor(b).engagement.setFollow({ userId: a, follow: true });
    await callerFor(a).trust.setBlock({ userId: b, blocked: true });
    await callerFor(a).trust.setBlock({ userId: b, blocked: true }); // idempotent

    assert.equal(await db.follow.count({ where: { OR: [{ followerId: a, followingId: b }, { followerId: b, followingId: a }] } }), 0);
    for (const id of [a, b]) {
      const u = await db.user.findUniqueOrThrow({ where: { id } });
      assert.equal(u.followerCount, 0);
      assert.equal(u.followingCount, 0);
    }
    await assert.rejects(callerFor(b).engagement.setFollow({ userId: a, follow: true }), withAppCode("BLOCKED"));
    assert.deepEqual((await callerFor(a).trust.blocked()).map((x) => x.id), [b]);
    await assert.rejects(callerFor(a).trust.setBlock({ userId: a, blocked: true }), /yourself/);
    await callerFor(a).trust.setBlock({ userId: b, blocked: false });
    assert.equal((await callerFor(a).trust.blocked()).length, 0);
  });

  it("a blocked user cannot comment, and their earlier comments vanish for everyone; the blocker also stops seeing a blocked commenter elsewhere", async () => {
    const creator = await createUser("blk-creator");
    const pest = await createUser("blk-pest");
    const reader = await createUser("blk-reader");
    const other = await createUser("blk-other");
    await verify(pest, reader, other, creator);
    const track = await createTrack(creator, { title: "Moderated" });
    const spam = await callerFor(pest).comments.create({ trackId: track.id, content: "buy now" });
    await callerFor(reader).comments.create({ trackId: track.id, content: "nice" });
    assert.equal((await callerFor().comments.list({ trackId: track.id })).comments.length, 2);

    await callerFor(creator).trust.setBlock({ userId: pest, blocked: true });
    await assert.rejects(callerFor(pest).comments.create({ trackId: track.id, content: "again" }), withAppCode("BLOCKED"));
    const afterBlock = await callerFor().comments.list({ trackId: track.id });
    assert.deepEqual(afterBlock.comments.map((c) => c.content), ["nice"], "hidden from everyone");
    assert.ok(!afterBlock.comments.some((c) => c.id === spam.id));

    // a reader who blocked someone no longer sees that person's comments (on other creators' tracks too)
    const elsewhere = await createTrack(other, { title: "Elsewhere" });
    await callerFor(reader).comments.create({ trackId: elsewhere.id, content: "reader says hi" });
    await callerFor(creator).comments.create({ trackId: elsewhere.id, content: "creator says hi" });
    await callerFor(reader).trust.setBlock({ userId: creator, blocked: true });
    assert.deepEqual((await callerFor(reader).comments.list({ trackId: elsewhere.id })).comments.map((c) => c.content), ["reader says hi"]);
    assert.equal((await callerFor(other).comments.list({ trackId: elsewhere.id })).comments.length, 2);
  });

  it("blocked creators disappear from search and related tracks for the blocker (and for the blocked)", async () => {
    const word = `blk${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const me = await createUser("blk-search-me");
    const them = await createUser("blk-search-them");
    const seedOwner = await createUser("blk-seed");
    const theirs = await createTrack(them, { title: `${word} song`, genre: word });
    const seed = await createTrack(seedOwner, { title: "seed", genre: word });
    assert.ok((await callerFor(me).search.tracks({ q: word })).items.some((t) => t.id === theirs.id));
    assert.ok((await callerFor(me).tracks.related({ trackId: seed.id })).some((t) => t.id === theirs.id));

    await callerFor(me).trust.setBlock({ userId: them, blocked: true });
    assert.ok(!(await callerFor(me).search.tracks({ q: word })).items.some((t) => t.id === theirs.id));
    assert.ok(!(await callerFor(me).tracks.related({ trackId: seed.id })).some((t) => t.id === theirs.id));
    assert.ok((await callerFor().search.tracks({ q: word })).items.some((t) => t.id === theirs.id), "not a privacy wall for anonymous visitors");
  });
});

describe("reports (TS-1..TS-3)", () => {
  it("creates one open report per reporter per target (re-reporting updates it), refuses own and hidden content, validates copyright", async () => {
    const owner = await createUser("rep-owner");
    const reporter = await createUser("rep-reporter");
    const track = await createTrack(owner, { title: "Reported" });
    const hidden = await createTrack(owner, { title: "Hidden", visibility: "PRIVATE" });
    await verify(reporter, owner);
    const api = callerFor(reporter).trust;

    const first = await api.report({ targetType: "TRACK", targetId: track.id, reason: "SPAM" });
    const again = await api.report({ targetType: "TRACK", targetId: track.id, reason: "HATE", details: "worse" });
    assert.equal(again.id, first.id);
    assert.equal(again.updated, true);
    const row = await db.report.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(row.reason, "HATE");
    assert.equal(await db.report.count({ where: { reporterId: reporter } }), 1);

    await assert.rejects(callerFor(owner).trust.report({ targetType: "TRACK", targetId: track.id, reason: "SPAM" }), /own/);
    await assert.rejects(api.report({ targetType: "TRACK", targetId: hidden.id, reason: "SPAM" }), /could not be found/);
    await assert.rejects(api.report({ targetType: "USER", targetId: track.id, reason: "SPAM" }), /could not be found/);
    await assert.rejects(api.report({ targetType: "COLLECTION", targetId: (await createCollection(owner, { visibility: "PRIVATE" })).id, reason: "SPAM" }), /could not be found/);

    const copyright = await api.report({ targetType: "USER", targetId: owner, reason: "COPYRIGHT", rightsHolder: true, originalUrl: "https://example.com/original" });
    assert.deepEqual((await db.report.findUniqueOrThrow({ where: { id: copyright.id } })).extra, { rightsHolder: true, originalUrl: "https://example.com/original" });
    await assert.rejects(api.report({ targetType: "COLLECTION", targetId: (await createCollection(owner)).id, reason: "COPYRIGHT" }), /rights holder/);
  });

  it("is limited to 20 new reports a day", async () => {
    const owner = await createUser("rep-limit-owner");
    const reporter = await createUser("rep-limit");
    const tracks = await Promise.all(Array.from({ length: 21 }, (_, i) => createTrack(owner, { title: `t${i}` })));
    for (const t of tracks.slice(0, 20)) await callerFor(reporter).trust.report({ targetType: "TRACK", targetId: t.id, reason: "SPAM" });
    await assert.rejects(callerFor(reporter).trust.report({ targetType: "TRACK", targetId: tracks[20]!.id, reason: "SPAM" }), withAppCode("RATE_LIMITED"));
  });
});

describe("admin and moderation (AD-1..AD-5)", () => {
  it("J9: a reported comment is removed by an admin: gone for everyone, commentCount correct, reporter notified, audit row written", async () => {
    const admin = await makeAdmin("j9-admin");
    const creator = await createUser("j9-creator");
    const author = await createUser("j9-author");
    const reporter = await createUser("j9-reporter");
    await verify(author, reporter, creator);
    const track = await createTrack(creator, { title: "J9" });
    const bad = await callerFor(author).comments.create({ trackId: track.id, content: "awful" });
    await callerFor(reporter).comments.create({ trackId: track.id, content: "fine" });
    await callerFor(creator).comments.create({ trackId: track.id, content: "reply", parentId: bad.id });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).commentCount, 3);

    await callerFor(reporter).trust.report({ targetType: "COMMENT", targetId: bad.id, reason: "HARASSMENT", details: "abusive" });
    const queue = await callerFor(admin).admin.reports({});
    assert.equal(queue.items.length >= 1, true);
    const item = queue.items.find((i) => i.targetId === bad.id)!;
    assert.equal(item.preview?.text, "awful");
    const detail = await callerFor(admin).admin.reportDetail({ targetType: "COMMENT", targetId: bad.id });
    assert.equal(detail.reports[0]?.reporter.id, reporter);

    await callerFor(admin).admin.remove({ targetType: "COMMENT", targetId: bad.id, reason: "Harassment" });
    assert.equal(await db.comment.count({ where: { trackId: track.id } }), 1, "comment and its reply are deleted for real");
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).commentCount, 1);
    assert.deepEqual((await callerFor().comments.list({ trackId: track.id })).comments.map((c) => c.content), ["fine"]);
    assert.match((await sysNotes(reporter)).at(-1)?.message ?? "", /took action/);
    assert.match((await sysNotes(author)).at(-1)?.message ?? "", /removed one of your comments/);
    assert.equal((await db.report.findFirstOrThrow({ where: { reporterId: reporter } })).status, "RESOLVED");
    const audit = await db.moderationAction.findFirstOrThrow({ where: { targetId: bad.id } });
    assert.deepEqual([audit.action, audit.adminId, audit.reason], ["REMOVE_CONTENT", admin, "Harassment"]);
  });

  it("removing a track hides it (restorable), recounts, resolves reports; dismiss tells reporters there was no violation", async () => {
    const admin = await makeAdmin("rm-admin");
    const owner = await createUser("rm-owner");
    const reporter = await createUser("rm-reporter");
    const track = await createTrack(owner, { title: "Pirated" });
    const fine = await createTrack(owner, { title: "Fine" });
    await db.user.update({ where: { id: owner }, data: { publicTrackCount: 2 } });
    await callerFor(reporter).trust.report({ targetType: "TRACK", targetId: track.id, reason: "COPYRIGHT", details: "mine" });
    await callerFor(reporter).trust.report({ targetType: "TRACK", targetId: fine.id, reason: "SPAM" });

    await assert.rejects(callerFor(admin).admin.remove({ targetType: "TRACK", targetId: track.id, reason: " " }));
    await callerFor(admin).admin.remove({ targetType: "TRACK", targetId: track.id, reason: "Copyright" });
    const username = usernameOf(owner);
    assert.deepEqual((await callerFor().tracks.byPermalink({ username, slug: (await db.track.findUniqueOrThrow({ where: { id: track.id } })).slug })).status, "missing");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 1);
    assert.match((await sysNotes(owner))[0]?.message ?? "", /Reason: Copyright/);

    await callerFor(admin).admin.restore({ targetType: "TRACK", targetId: track.id });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).moderationState, "VISIBLE");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 2);

    await callerFor(admin).admin.dismiss({ targetType: "TRACK", targetId: fine.id });
    assert.equal((await db.report.findFirstOrThrow({ where: { targetId: fine.id } })).status, "DISMISSED");
    assert.ok((await sysNotes(reporter)).some((n) => (n.message ?? "").includes("no violation")));
    assert.deepEqual((await db.moderationAction.findMany({ where: { adminId: admin }, orderBy: { createdAt: "asc" } })).map((a) => a.action), ["REMOVE_CONTENT", "RESTORE_CONTENT", "DISMISS"]);
  });

  it("suspending a user ends their sessions, hides their content, blocks sign-in; unsuspend restores; admins cannot be suspended", async () => {
    const admin = await makeAdmin("su-admin");
    const other = await makeAdmin("su-other-admin");
    const user = await createUser("su-user");
    const track = await createTrack(user, { title: "Suspended track" });
    await db.session.create({ data: { id: crypto.randomUUID(), userId: user, token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date() } });
    await assert.rejects(callerFor(admin).admin.suspend({ userId: other, reason: "no" }), /Admins cannot/);

    await callerFor(admin).admin.suspend({ userId: user, reason: "Spam ring" });
    assert.equal(await db.session.count({ where: { userId: user } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user } })).status, "SUSPENDED");
    assert.equal((await callerFor().tracks.byPermalink({ username: usernameOf(user), slug: (await db.track.findUniqueOrThrow({ where: { id: track.id } })).slug })).status, "missing");
    await assert.rejects(callerFor(user).library.history(), /UNAUTHORIZED/);

    await callerFor(admin).admin.unsuspend({ userId: user });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user } })).status, "ACTIVE");
    const detail = await callerFor(admin).admin.user({ userId: user });
    assert.deepEqual(detail.actions.map((a) => a.action).sort(), ["SUSPEND_USER", "UNSUSPEND_USER"]);
  });

  it("admin tools are invisible to everyone else, including a revoked admin", async () => {
    const admin = await makeAdmin("gate-admin");
    const user = await createUser("gate-user");
    for (const caller of [callerFor(), callerFor(user)]) {
      await assert.rejects(caller.admin.dashboard(), /NOT_FOUND|UNAUTHORIZED/);
    }
    const stats = await callerFor(admin).admin.dashboard();
    assert.ok(typeof stats.openReports === "number");
    await db.user.update({ where: { id: admin }, data: { role: "USER" } });
    await assert.rejects(callerFor(admin).admin.dashboard(), /NOT_FOUND/);
  });

  it("admin user tools: search by name/email, verified badge, plan change, all audited", async () => {
    const admin = await makeAdmin("tools-admin");
    const user = await createUser("tools-user");
    const found = await callerFor(admin).admin.users({ q: usernameOf(user) });
    assert.equal(found.items[0]?.id, user);
    await callerFor(admin).admin.setVerified({ userId: user, verified: true });
    await callerFor(admin).admin.setPlan({ userId: user, plan: "PRO" });
    const row = await db.user.findUniqueOrThrow({ where: { id: user } });
    assert.deepEqual([row.verified, row.plan], [true, "PRO"]);
    assert.deepEqual((await db.moderationAction.findMany({ where: { targetId: user }, orderBy: { createdAt: "asc" } })).map((a) => a.action), ["VERIFY_USER", "SET_PLAN_PRO"]);
  });
});
