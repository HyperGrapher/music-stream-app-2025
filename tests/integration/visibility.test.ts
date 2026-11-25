import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import {
  callerFor,
  cleanup,
  createCollection,
  createTrack,
  createUser,
  db,
  freezeClock,
  resetClock,
  usernameOf,
} from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

/** PRD 7.7 / 16.3: private, scheduled, removed and suspended content never appears on a public surface. */
async function world() {
  const owner = await createUser("vis-owner");
  const stranger = await createUser("vis-stranger");
  const pub = await createTrack(owner, { title: "pub" });
  const priv = await createTrack(owner, { title: "priv", visibility: "PRIVATE" });
  const future = new Date(Date.now() + 2 * 86_400_000);
  const scheduled = await createTrack(owner, { title: "sched", visibility: "SCHEDULED", publishAt: future, publishedAt: future });
  const removed = await createTrack(owner, { title: "removed", moderationState: "REMOVED" });
  return { owner, stranger, pub, priv, scheduled, removed, future };
}

const byPermalink = (viewer: string | undefined, owner: string, track: { slug: string }, secret?: string) =>
  callerFor(viewer).tracks.byPermalink({ username: usernameOf(owner), slug: track.slug, secret });

describe("tracks.byPermalink (7.7 visibility matrix)", () => {
  it("public tracks are open to everyone; the page shows no owner-only data", async () => {
    const { owner, pub } = await world();
    const result = await byPermalink(undefined, owner, pub);
    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.equal(result.track.id, pub.id);
      assert.equal(result.track.secretToken, null);
      assert.equal(result.track.isOwner, false);
    }
  });

  it("private tracks 404 for everyone but the owner, and open through the secret link (J7)", async () => {
    const { owner, stranger, priv } = await world();
    assert.equal((await byPermalink(undefined, owner, priv)).status, "missing");
    assert.equal((await byPermalink(stranger, owner, priv)).status, "missing");

    const asOwner = await byPermalink(owner, owner, priv);
    assert.equal(asOwner.status, "ok");
    if (asOwner.status === "ok") assert.equal(asOwner.track.secretToken, priv.secretToken);

    const viaLink = await byPermalink(undefined, owner, priv, priv.secretToken);
    assert.equal(viaLink.status, "ok");
    if (viaLink.status === "ok") {
      assert.equal(viaLink.track.secretToken, null, "the link holder is not told the token");
      assert.match(viaLink.track.streamUrl ?? "", new RegExp(`\\?s=${priv.secretToken}$`));
      assert.equal(viaLink.track.viaSecret, true);
    }
    assert.equal((await byPermalink(undefined, owner, priv, "x".repeat(22))).status, "missing");
  });

  it("resetting the secret link invalidates the old one immediately (IA-5)", async () => {
    const { owner, priv } = await world();
    const oldToken = priv.secretToken;
    await db.track.update({ where: { id: priv.id }, data: { secretToken: "n".repeat(22) } });
    assert.equal((await byPermalink(undefined, owner, priv, oldToken)).status, "missing");
    assert.equal((await byPermalink(undefined, owner, priv, "n".repeat(22))).status, "ok");
  });

  it("scheduled tracks are invisible until publishAt, then public without any job (J8)", async () => {
    const { owner, scheduled, future } = await world();
    assert.equal((await byPermalink(undefined, owner, scheduled)).status, "missing");
    freezeClock(new Date(future.getTime() + 60_000));
    try {
      assert.equal((await byPermalink(undefined, owner, scheduled)).status, "ok");
    } finally {
      resetClock();
    }
  });

  it("removed tracks are hidden from everyone but the owner, even with the secret", async () => {
    const { owner, stranger, removed } = await world();
    assert.equal((await byPermalink(stranger, owner, removed)).status, "missing");
    assert.equal((await byPermalink(undefined, owner, removed, removed.secretToken)).status, "missing");
    assert.equal((await byPermalink(owner, owner, removed)).status, "ok");
  });

  it("suspended and deleted accounts do not exist publicly (PR-5)", async () => {
    for (const status of ["SUSPENDED", "DELETED"] as const) {
      const owner = await createUser(`vis-${status.toLowerCase()}`, { status });
      const track = await createTrack(owner, { title: "hidden" });
      assert.equal((await byPermalink(undefined, owner, track)).status, "missing", status);
      assert.equal((await callerFor().profiles.byUsername({ username: usernameOf(owner) })).status, "missing", status);
    }
  });

  it("usernames are case-insensitive", async () => {
    const { owner, pub } = await world();
    const shouted = await callerFor().tracks.byPermalink({ username: usernameOf(owner).toUpperCase(), slug: pub.slug.toUpperCase() });
    assert.equal(shouted.status, "ok");
  });
});

describe("listings never leak hidden content (16.3)", () => {
  it("profile tracks and discover only show effectively public tracks", async () => {
    const { owner, pub, priv, scheduled, removed } = await world();
    const profile = (await callerFor().profiles.tracks({ username: usernameOf(owner) })).map((t) => t.id);
    assert.deepEqual(profile, [pub.id]);
    // the owner's own profile tab still lists only public tracks (private ones live in Studio, PR-4)
    assert.deepEqual((await callerFor(owner).profiles.tracks({ username: usernameOf(owner) })).map((t) => t.id), [pub.id]);

    const discover = (await callerFor().discover.tracks({ q: usernameOf(owner), limit: 48 })).map((t) => t.id);
    assert.deepEqual(discover, [pub.id]);
    for (const hidden of [priv, scheduled, removed]) assert.ok(!profile.includes(hidden.id) && !discover.includes(hidden.id));
  });

  it("a track published by schedule shows up in listings once its time has passed", async () => {
    const { owner, scheduled, future } = await world();
    assert.equal((await callerFor().profiles.tracks({ username: usernameOf(owner) })).some((t) => t.id === scheduled.id), false);
    freezeClock(new Date(future.getTime() + 1000));
    try {
      assert.equal((await callerFor().profiles.tracks({ username: usernameOf(owner) })).some((t) => t.id === scheduled.id), true);
    } finally {
      resetClock();
    }
  });

  it("Quiet Mode hides public counters from everyone but the owner (TR-3)", async () => {
    const owner = await createUser("vis-quiet");
    const track = await createTrack(owner, { title: "quiet", playCount: 99, likeCount: 7, statsPublic: false });
    const stranger = await callerFor().profiles.tracks({ username: usernameOf(owner) });
    assert.deepEqual([stranger[0]?.playCount, stranger[0]?.likeCount], [0, 0]);
    const own = await callerFor(owner).profiles.tracks({ username: usernameOf(owner) });
    assert.deepEqual([own[0]?.playCount, own[0]?.likeCount, own[0]?.id], [99, 7, track.id]);
  });
});

describe("collections", () => {
  it("private collections open only through their secret; unavailable tracks keep their place (VI-3)", async () => {
    const owner = await createUser("vis-set-owner");
    const other = await createUser("vis-set-other");
    const a = await createTrack(owner, { title: "a" });
    const hidden = await createTrack(other, { title: "hidden", visibility: "PRIVATE" });
    const b = await createTrack(owner, { title: "b" });
    const collection = await createCollection(owner, { title: "mixed", trackIds: [a.id, hidden.id, b.id] });
    const priv = await createCollection(owner, { title: "secret set", visibility: "PRIVATE", trackIds: [a.id] });

    const view = await callerFor().collections.byPermalink({ username: usernameOf(owner), slug: collection.slug });
    assert.equal(view.status, "ok");
    if (view.status === "ok") {
      assert.deepEqual(view.collection.tracks.map((t) => [t.position, t.available]), [[0, true], [1, false], [2, true]]);
      assert.equal(view.collection.tracks[1]?.available === false && "title" in view.collection.tracks[1], false, "no details leak");
    }

    const slug = { username: usernameOf(owner), slug: priv.slug };
    assert.equal((await callerFor().collections.byPermalink(slug)).status, "missing");
    assert.equal((await callerFor().collections.byPermalink({ ...slug, secret: priv.secretToken })).status, "ok");
    assert.equal((await callerFor(owner).collections.byPermalink(slug)).status, "ok");
  });

  it("a collection secret link opens the owner's private tracks inside it, and nobody else's", async () => {
    const owner = await createUser("vis-via-owner");
    const other = await createUser("vis-via-other");
    const mine = await createTrack(owner, { title: "mine", visibility: "PRIVATE" });
    const theirs = await createTrack(other, { title: "theirs", visibility: "PRIVATE" });
    const set = await createCollection(owner, { title: "private album", visibility: "PRIVATE", trackIds: [mine.id, theirs.id] });
    const view = await callerFor().collections.byPermalink({ username: usernameOf(owner), slug: set.slug, secret: set.secretToken });
    assert.equal(view.status, "ok");
    if (view.status === "ok") {
      assert.deepEqual(view.collection.tracks.map((t) => t.available), [true, false]);
      const first = view.collection.tracks[0];
      assert.ok(first?.available && first.streamUrl?.includes(`c=${set.id}`));
    }
  });
});

describe("renamed usernames and slugs keep working (IA-4)", () => {
  it("old usernames and old slugs redirect to the current permalink", async () => {
    const owner = await createUser("vis-rename");
    const track = await createTrack(owner, { title: "renamed" });
    const oldUsername = usernameOf(owner);
    const newUsername = `${oldUsername.slice(0, 15)}-new`;
    await db.user.update({ where: { id: owner }, data: { username: newUsername } });
    await db.usernameRedirect.create({ data: { oldUsername, userId: owner } });

    const viaOldName = await callerFor().tracks.byPermalink({ username: oldUsername, slug: track.slug });
    assert.deepEqual(viaOldName, { status: "redirect", to: `/${newUsername}/${track.slug}` });
    assert.deepEqual(await callerFor().profiles.byUsername({ username: oldUsername }), { status: "redirect", to: `/${newUsername}` });

    await db.slugRedirect.create({ data: { ownerId: owner, kind: "TRACK", oldSlug: "old-slug", targetId: track.id } });
    const viaOldSlug = await callerFor().tracks.byPermalink({ username: newUsername, slug: "old-slug" });
    assert.deepEqual(viaOldSlug, { status: "redirect", to: `/${newUsername}/${track.slug}` });
    await db.usernameRedirect.deleteMany({ where: { oldUsername } });
  });
});
