import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { RESERVED_USERNAMES } from "@/lib/names";
import { pruneAnalytics, recordHit, touchView } from "@/server/modules/analytics";
import { clearReservedCache } from "@/server/modules/reserved";

import { callerFor, cleanup, createUser, db, resetRateLimits } from "./helpers";

after(async () => {
  await db.reservedName.deleteMany();
  await cleanup();
  await db.$disconnect();
});
beforeEach(async () => {
  await db.pageView.deleteMany();
  await resetRateLimits();
  await db.reservedName.deleteMany();
  clearReservedCache();
});

const admin = () => createUser("adm", { role: "ADMIN" });

describe("admin reserved usernames", () => {
  it("adds names from a file, blocks them for sign-up checks and renames, and can unblock and remove them", async () => {
    const a = await admin();
    const user = await createUser("rn-user");
    const result = await callerFor(a).admin.addReservedNames({ text: "# list\nBrandX\r\nfoundation\n\nadmin\nno\nbrandx\n" });
    assert.equal(result.added, 2);
    assert.deepEqual(result.rejected.map((r) => r.reason).sort(), ["BUILT_IN", "DUPLICATE", "INVALID"]);
    assert.equal(await db.reservedName.count({ where: { name: "admin" } }), 0, "a built-in name is never stored");

    assert.deepEqual(await callerFor(user).account.checkUsername({ username: "BrandX" }).then((c) => !c.available && c.reason), "RESERVED");
    await assert.rejects(callerFor(user).account.updateProfile({ username: "foundation" }), /reserved/i);

    await callerFor(a).admin.setReservedBlocked({ name: "brandx", blocked: false });
    assert.equal((await callerFor(user).account.checkUsername({ username: "brandx" })).available, true);
    await callerFor(a).admin.setReservedBlocked({ name: "brandx", blocked: true });
    assert.equal((await callerFor(user).account.checkUsername({ username: "brandx" })).available, false);

    await callerFor(a).admin.removeReservedName({ name: "brandx" });
    assert.equal((await callerFor(user).account.checkUsername({ username: "brandx" })).available, true);
    const list = await callerFor(a).admin.reservedNames();
    assert.deepEqual(list.custom.map((c) => c.name), ["foundation"]);
    assert.equal(list.builtIn.length, RESERVED_USERNAMES.size);
  });

  it("the built-in list cannot be altered, whatever is tried", async () => {
    const a = await admin();
    await assert.rejects(callerFor(a).admin.setReservedBlocked({ name: "admin", blocked: false }), /cannot be changed/);
    await assert.rejects(callerFor(a).admin.removeReservedName({ name: "Settings" }), /cannot be changed/);
    await callerFor(a).admin.addReservedNames({ text: "studio\nupload" });
    assert.equal(await db.reservedName.count(), 0);
    const user = await createUser("rn-b");
    assert.equal((await callerFor(user).account.checkUsername({ username: "settings" })).available, false);
    assert.equal(RESERVED_USERNAMES.has("settings"), true);
  });

  it("only admins can manage the list", async () => {
    const user = await createUser("rn-plain");
    await assert.rejects(callerFor(user).admin.addReservedNames({ text: "x-name" }), /NOT_FOUND/);
    await assert.rejects(callerFor(user).admin.reservedNames(), /NOT_FOUND/);
    await assert.rejects(callerFor().admin.reservedNames(), /UNAUTHORIZED/);
  });
});

const hit = (over: Partial<Parameters<typeof recordHit>[1]> = {}) =>
  recordHit(db, { visitorId: "visitor-aaaa", sessionId: "session-aaaa", userId: null, ip: "203.0.113.5", countryCode: "DE", city: "Berlin", path: "/", referrer: null, userAgent: "Mozilla/5.0 Chrome/120", device: "desktop", browser: "Chrome", ...over });

describe("visitor analytics", () => {
  it("counts who is online (registered and guests), their page and time, and stops counting after two minutes", async () => {
    const a = await admin();
    const member = await createUser("an-member");
    const t0 = new Date();
    const first = await hit({ now: new Date(t0.getTime() - 50_000), path: "/discover" });
    await hit({ now: new Date(t0.getTime() - 20_000), path: "/charts" });
    await hit({ visitorId: "visitor-bbbb", sessionId: "session-bbbb", userId: member, ip: "198.51.100.7", countryCode: "US", path: "/feed" });
    await hit({ visitorId: "visitor-old1", sessionId: "session-old1", now: new Date(Date.now() - 10 * 60_000) });
    await touchView(db, first, "someone-else");
    assert.equal((await db.pageView.findUniqueOrThrow({ where: { id: first } })).lastSeenAt.getTime() < t0.getTime() - 40_000, true, "another visitor cannot touch a view");

    const live = await callerFor(a).admin.onlineNow();
    assert.deepEqual([live.total, live.registered, live.guests], [2, 1, 1]);
    const guest = live.visitors.find((v) => !v.user)!;
    assert.deepEqual([guest.path, guest.countryCode, guest.ip, guest.pages], ["/charts", "DE", "203.0.113.5", 2]);
    assert.ok(guest.onSiteSeconds >= 29);
    assert.equal(live.visitors.find((v) => v.user)?.user?.id, member);
  });

  it("summarises pages, countries, referrers, sessions and bounce rate", async () => {
    const a = await admin();
    await hit({ path: "/", referrer: "www.google.com" });
    await hit({ path: "/discover" });
    await hit({ visitorId: "visitor-bbbb", sessionId: "session-bbbb", countryCode: "US", path: "/" });
    const d = await callerFor(a).admin.analytics({ days: 7 });
    assert.deepEqual([d.totals.visitors, d.totals.views, d.totals.sessions, d.totals.bounceRate], [2, 3, 2, 0.5]);
    assert.deepEqual(d.pages[0], { path: "/", visitors: 2, views: 2, avgSeconds: 0 });
    assert.deepEqual(d.countries.map((c) => [c.label, c.views]), [["DE", 2], ["US", 1]]);
    assert.ok(d.referrers.some((r) => r.label === "www.google.com"));
    const long = d.sessions.find((s) => s.sessionId === "session-aaaa")!;
    assert.deepEqual([long.pages, long.entry, long.exit], [2, "/", "/discover"]);
    await assert.rejects(callerFor(await createUser("an-plain")).admin.analytics({ days: 7 }), /NOT_FOUND/);
  });

  it("clears IPs after 30 days and deletes views after 90", async () => {
    const now = new Date();
    await hit({ now: new Date(now.getTime() - 40 * 86_400_000) });
    await hit({ visitorId: "visitor-bbbb", now: new Date(now.getTime() - 100 * 86_400_000) });
    await hit();
    assert.deepEqual(await pruneAnalytics(db, now), { ipsCleared: 2, pageViewsDeleted: 1 });
    const rows = await db.pageView.findMany({ orderBy: { startedAt: "asc" } });
    assert.deepEqual(rows.map((r) => r.ip), [null, "203.0.113.5"]);
  });
});
