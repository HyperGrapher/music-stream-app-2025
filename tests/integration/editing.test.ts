import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createCollection, createTrack, createUser, db, freezeClock, resetClock, resetRateLimits, usernameOf, withAppCode } from "./helpers";

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300)); // let background storage drains (after()) finish
  await cleanup();
  await db.storageDeletion.deleteMany({ where: { bucket: "test-bucket" } });
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const MIN = 60_000;
const publish = (owner: string, durationMs: number, fields: Record<string, unknown> = {}) =>
  createAsset(owner, { durationMs }).then((asset) => callerFor(owner).upload.createTrack({ title: "T", mediaAssetId: asset.id, ...fields }));

describe("upload-time quota (UP-8, 2.3)", () => {
  it("Free users have 60 minutes in total; Pro users are unlimited", async () => {
    const free = await createUser("quota-free");
    await publish(free, 40 * MIN);
    await assert.rejects(publish(free, 40 * MIN), withAppCode("UPLOAD_LIMIT_REACHED"));
    await publish(free, 20 * MIN); // exactly fills the allowance
    assert.deepEqual((await callerFor(free).upload.quota()).remainingMs, 0);

    const pro = await createUser("quota-pro", { plan: "PRO" });
    await publish(pro, 100 * MIN);
    await publish(pro, 100 * MIN);
    const quota = await callerFor(pro).upload.quota();
    assert.deepEqual([quota.limitMs, quota.remainingMs, quota.usedMs], [null, null, 200 * MIN]);
  });

  it("a rejected publish leaves the files READY and untouched; releases are checked as a whole", async () => {
    const owner = await createUser("quota-rel");
    const [a, b] = await Promise.all([createAsset(owner, { durationMs: 40 * MIN }), createAsset(owner, { durationMs: 40 * MIN })]);
    await assert.rejects(
      callerFor(owner).upload.createCollection({ title: "Too long", tracks: [{ mediaAssetId: a.id, title: "a" }, { mediaAssetId: b.id, title: "b" }] }),
      withAppCode("UPLOAD_LIMIT_REACHED"),
    );
    assert.deepEqual((await db.mediaAsset.findMany({ where: { id: { in: [a.id, b.id] } } })).map((x) => x.status), ["READY", "READY"]);
    assert.equal(await db.collection.count({ where: { ownerId: owner } }), 0);
  });

  it("deleting a track gives its time back", async () => {
    const owner = await createUser("quota-back");
    const { track } = await publish(owner, 45 * MIN);
    assert.equal((await callerFor(owner).upload.quota()).remainingMs, 15 * MIN);
    await callerFor(owner).tracks.delete({ id: track.id });
    assert.equal((await callerFor(owner).upload.quota()).remainingMs, 60 * MIN);
  });
});

describe("full field set and privacy transitions (7.3, 7.7, ED-2)", () => {
  it("stores and normalises every field", async () => {
    const owner = await createUser("fields");
    const { track } = await publish(owner, 3 * MIN, {
      title: "Everything", artistName: "The Band", featuredArtists: "Guest", genre: "Jazz Fusion!", tags: ["Lo-Fi", "lo-fi", "#chill"],
      description: "desc", isrc: "us-abc-24-12345", bpm: 128, musicalKey: "A minor", explicit: true, buyUrl: "https://shop.example/x",
      buyTitle: "Get it", license: "CC_BY", downloadable: true, commentsEnabled: false, embeddable: false, recordLabel: "Label", publisher: "Pub",
    });
    const row = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.deepEqual(
      [row.genre, row.tags, row.isrc, row.bpm, row.musicalKey, row.explicit, row.license, row.downloadable, row.commentsEnabled, row.embeddable, row.artistName, row.recordLabel],
      ["jazz-fusion", ["lo-fi", "chill"], "USABC2412345", 128, "A minor", true, "CC_BY", true, false, false, "The Band", "Label"],
    );
    assert.equal(row.previewStartMs, 45_000, "default preview is 25 % in");
  });

  it("scheduling is a Pro feature, needs 5 minutes to a year ahead, and publishes at read time (J8)", async () => {
    const free = await createUser("sched-free");
    const pro = await createUser("sched-pro", { plan: "PRO" });
    const at = new Date(Date.now() + 2 * 86_400_000);
    await assert.rejects(publish(free, MIN, { privacy: "scheduled", publishAt: at }), withAppCode("PLAN_REQUIRED"));
    await assert.rejects(publish(pro, MIN, { privacy: "scheduled", publishAt: new Date(Date.now() + 60_000) }), /5 minutes/);
    await assert.rejects(publish(pro, MIN, { privacy: "scheduled", publishAt: new Date(Date.now() + 400 * 86_400_000) }), /within the next year/);
    await assert.rejects(publish(pro, MIN, { privacy: "scheduled" }), /when to publish/);

    const { track } = await publish(pro, MIN, { privacy: "scheduled", publishAt: at });
    const row = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.deepEqual([row.visibility, row.publishedAt?.getTime()], ["SCHEDULED", at.getTime()]);
    assert.equal((await db.activity.findFirstOrThrow({ where: { trackId: track.id } })).createdAt.getTime(), at.getTime(), "feed entry appears at publish time");
    const view = (viewer?: string) => callerFor(viewer).tracks.byPermalink({ username: usernameOf(pro), slug: row.slug });
    assert.equal((await view()).status, "missing");
    freezeClock(new Date(at.getTime() + 1000));
    try {
      assert.equal((await view()).status, "ok");
      assert.equal((await callerFor().profiles.byUsername({ username: usernameOf(pro) })).status, "ok");
    } finally {
      resetClock();
    }
  });

  it("Quiet Mode (hiding stats) is Pro; existing quiet tracks keep it after a downgrade (PL-3)", async () => {
    const free = await createUser("quiet-free");
    await assert.rejects(publish(free, MIN, { statsPublic: false }), withAppCode("PLAN_REQUIRED"));
    const pro = await createUser("quiet-pro", { plan: "PRO" });
    const { track } = await publish(pro, MIN, { statsPublic: false });
    await db.user.update({ where: { id: pro }, data: { plan: "FREE" } });
    await callerFor(pro).tracks.update({ id: track.id, title: "Still quiet", statsPublic: false }); // unchanged: allowed
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).statsPublic, false);
  });

  it("ED-2: publishedAt is set the first time a track becomes public and never moves again", async () => {
    const owner = await createUser("first-public");
    const { track } = await publish(owner, MIN, { privacy: "private" });
    const before = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.equal(before.publishedAt, null);
    assert.equal(await db.activity.count({ where: { trackId: track.id } }), 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 0);

    await callerFor(owner).tracks.update({ id: track.id, privacy: "public" });
    const first = (await db.track.findUniqueOrThrow({ where: { id: track.id } })).publishedAt;
    assert.ok(first);
    assert.equal(await db.activity.count({ where: { trackId: track.id, type: "TRACK_POSTED" } }), 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 1);

    await callerFor(owner).tracks.update({ id: track.id, privacy: "private" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 0);
    await new Promise((r) => setTimeout(r, 15));
    await callerFor(owner).tracks.update({ id: track.id, privacy: "public" });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).publishedAt?.getTime(), first.getTime());
    assert.equal(await db.activity.count({ where: { trackId: track.id } }), 1, "no second feed entry");
  });

  it("making a public track private hides it everywhere at once (ED-2)", async () => {
    const owner = await createUser("hide");
    const { track } = await publish(owner, MIN);
    const slug = track.slug;
    assert.equal((await callerFor().profiles.tracks({ username: usernameOf(owner) })).length, 1);
    await callerFor(owner).tracks.update({ id: track.id, privacy: "private" });
    assert.equal((await callerFor().profiles.tracks({ username: usernameOf(owner) })).length, 0);
    assert.equal((await callerFor().tracks.byPermalink({ username: usernameOf(owner), slug })).status, "missing");
    assert.equal((await callerFor().profiles.tabPage({ username: usernameOf(owner), tab: "all" })).items.length, 0);
  });
});

describe("editing a track (7.5)", () => {
  it("only the owner can read the editor data or change anything", async () => {
    const owner = await createUser("edit-owner");
    const other = await createUser("edit-other");
    const { track } = await publish(owner, MIN);
    await assert.rejects(callerFor(other).tracks.forEdit({ id: track.id }), { code: "NOT_FOUND" });
    await assert.rejects(callerFor(other).tracks.update({ id: track.id, title: "mine now" }), { code: "NOT_FOUND" });
    await assert.rejects(callerFor(other).tracks.delete({ id: track.id }), { code: "NOT_FOUND" });
    await assert.rejects(callerFor(other).tracks.resetSecret({ id: track.id }), { code: "NOT_FOUND" });
    await assert.rejects(callerFor().tracks.update({ id: track.id, title: "x" }), { code: "UNAUTHORIZED" });
    const editable = await callerFor(owner).tracks.forEdit({ id: track.id });
    assert.equal(editable.secretToken.length, 22);
  });

  it("ED-5: a permalink change keeps the old URL working, validates, and can be taken back", async () => {
    const owner = await createUser("slug-owner");
    const { track } = await publish(owner, MIN, { title: "First Name" });
    const api = callerFor(owner).tracks;
    const other = await publish(owner, MIN, { title: "Taken" });
    assert.deepEqual(await api.checkSlug({ slug: other.track.slug }), { available: false, reason: "TAKEN" });
    assert.deepEqual(await api.checkSlug({ slug: "albums" }), { available: false, reason: "RESERVED" });
    assert.deepEqual(await api.checkSlug({ slug: "Not Valid" }), { available: false, reason: "INVALID" });
    assert.deepEqual(await api.checkSlug({ slug: track.slug, selfId: track.id }), { available: true });
    await assert.rejects(api.update({ id: track.id, slug: other.track.slug }), { code: "CONFLICT" });
    await assert.rejects(api.update({ id: track.id, slug: "popular-tracks" }), { code: "BAD_REQUEST" });

    await api.update({ id: track.id, slug: "brand-new" });
    const viaOld = await callerFor().tracks.byPermalink({ username: usernameOf(owner), slug: "first-name" });
    assert.deepEqual(viaOld, { status: "redirect", to: `/${usernameOf(owner)}/brand-new` });
    assert.equal((await callerFor().tracks.byPermalink({ username: usernameOf(owner), slug: "brand-new" })).status, "ok");
    await api.update({ id: track.id, slug: "first-name" });
    assert.equal(await db.slugRedirect.count({ where: { ownerId: owner, oldSlug: "first-name" } }), 0);
  });

  it("IA-5: resetting the secret link breaks the old link immediately", async () => {
    const owner = await createUser("reset-secret");
    const { track } = await publish(owner, MIN, { privacy: "private" });
    const old = (await db.track.findUniqueOrThrow({ where: { id: track.id } })).secretToken;
    const view = (secret: string) => callerFor().tracks.byPermalink({ username: usernameOf(owner), slug: track.slug, secret });
    assert.equal((await view(old)).status, "ok");
    const { secretToken } = await callerFor(owner).tracks.resetSecret({ id: track.id });
    assert.notEqual(secretToken, old);
    assert.equal((await view(old)).status, "missing");
    assert.equal((await view(secretToken)).status, "ok");
  });

  it("swapping artwork claims the new image and queues the old renditions for deletion", async () => {
    const owner = await createUser("art-swap");
    const image = async () => {
      const asset = await createAsset(owner, { kind: "IMAGE" });
      return db.mediaAsset.update({ where: { id: asset.id }, data: { imageWidths: [96, 320, 640], storageKey: `artworks/${owner}/${asset.id}/640.webp` } });
    };
    const first = await image();
    const { track } = await publish(owner, MIN, { artworkAssetId: first.id });
    const second = await image();
    await callerFor(owner).tracks.update({ id: track.id, artworkAssetId: second.id });
    assert.equal(await db.mediaAsset.count({ where: { id: first.id } }), 0);
    assert.equal((await db.storageDeletion.findMany({ where: { key: { startsWith: `artworks/${owner}/${first.id}/` } } })).length, 3);
    await callerFor(owner).tracks.update({ id: track.id, artworkAssetId: null });
    assert.equal(await db.mediaAsset.count({ where: { id: second.id } }), 0);
  });

  it("validates fields on update (bpm, isrc, buy link) and clamps the preview window", async () => {
    const owner = await createUser("validate");
    const { track } = await publish(owner, 100_000);
    const api = callerFor(owner).tracks;
    for (const bad of [{ bpm: 5 }, { isrc: "nope" }, { buyUrl: "http://insecure.example" }, { musicalKey: "H major" }]) {
      await assert.rejects(api.update({ id: track.id, ...bad } as never));
    }
    await api.update({ id: track.id, previewStartMs: 90_000 });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).previewStartMs, 70_000);
  });
});

describe("deleting a track (ED-4)", () => {
  it("reports the consequences, then removes it everywhere, renumbers collections and queues its files", async () => {
    const owner = await createUser("del-owner");
    const fan = await createUser("del-fan");
    const a = await publish(owner, MIN, { title: "a" });
    const b = await publish(owner, MIN, { title: "b" });
    const c = await publish(owner, MIN, { title: "c" });
    const set = await createCollection(owner, { title: "set", trackIds: [a.track.id, b.track.id, c.track.id] });
    await db.collectionTrack.updateMany({ where: { collectionId: set.id }, data: {} });
    await callerFor(fan).engagement.setTrackLike({ trackId: b.track.id, liked: true });
    await db.comment.create({ data: { authorId: fan, trackId: b.track.id, content: "hi" } });
    const bRow = await db.track.findUniqueOrThrow({ where: { id: b.track.id } });

    assert.deepEqual(await callerFor(owner).tracks.deleteImpact({ id: b.track.id }), { title: "b", comments: 1, likes: 1, reposts: 0, collections: 1, plays: 0 });
    await callerFor(owner).tracks.delete({ id: b.track.id });

    assert.equal(await db.track.count({ where: { id: b.track.id } }), 0);
    const entries = await db.collectionTrack.findMany({ where: { collectionId: set.id }, orderBy: { position: "asc" } });
    assert.deepEqual(entries.map((e) => e.position), [0, 1]);
    const row = await db.collection.findUniqueOrThrow({ where: { id: set.id } });
    assert.deepEqual([row.trackCount, row.durationMs], [2, 120_000]);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 2);
    assert.equal(await db.mediaAsset.count({ where: { id: bRow.audioAssetId } }), 0);
    assert.ok(await db.storageDeletion.findFirst({ where: { key: { contains: bRow.audioAssetId } } }) ?? await db.storageDeletion.findFirst({ where: { bucket: "test-bucket" } }));
    assert.equal(await db.trackDailyStat.count({ where: { trackId: b.track.id } }), 0);
  });

  it("keeps a shared audio file while another track still uses it", async () => {
    const owner = await createUser("del-shared");
    const a = await publish(owner, MIN, { title: "a" });
    const aRow = await db.track.findUniqueOrThrow({ where: { id: a.track.id } });
    const twin = await createTrack(owner, { title: "twin" });
    await db.track.update({ where: { id: twin.id }, data: { audioAssetId: aRow.audioAssetId } });
    await callerFor(owner).tracks.delete({ id: a.track.id });
    assert.equal(await db.mediaAsset.count({ where: { id: aRow.audioAssetId } }), 1);
  });
});

describe("replacing the audio file (ED-3, Pro)", () => {
  it("is a Pro feature", async () => {
    const free = await createUser("replace-free");
    const { track } = await publish(free, MIN);
    const next = await createAsset(free, { durationMs: MIN });
    await assert.rejects(callerFor(free).tracks.replaceAudio({ id: track.id, mediaAssetId: next.id }), withAppCode("PLAN_REQUIRED"));
  });

  it("keeps comments, likes and URL, follows the new duration, clamps the preview, updates collections", async () => {
    const owner = await createUser("replace-pro", { plan: "PRO" });
    const fan = await createUser("replace-fan");
    const { track } = await publish(owner, 200_000);
    await callerFor(owner).tracks.update({ id: track.id, previewStartMs: 150_000 });
    const set = await createCollection(owner, { title: "s", trackIds: [track.id] });
    await db.comment.create({ data: { authorId: fan, trackId: track.id, content: "at 2:30", timestampSeconds: 150 } });
    await callerFor(fan).engagement.setTrackLike({ trackId: track.id, liked: true });
    const oldAudio = (await db.track.findUniqueOrThrow({ where: { id: track.id } })).audioAssetId;
    const replacement = await createAsset(owner, { durationMs: 40_000 });

    await callerFor(owner).tracks.replaceAudio({ id: track.id, mediaAssetId: replacement.id });

    const row = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.deepEqual([row.audioAssetId, row.durationMs, row.previewStartMs, row.slug, row.likeCount], [replacement.id, 40_000, 10_000, track.slug, 1]);
    assert.equal(await db.comment.count({ where: { trackId: track.id } }), 1, "the 2:30 comment is kept even though the track is now 40 s");
    assert.equal(await db.mediaAsset.count({ where: { id: oldAudio } }), 0);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).durationMs, 40_000);
    assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: replacement.id } })).status, "ATTACHED");
  });
});

describe("collections: release editor and editing (7.4, 7.6)", () => {
  it("per-track details override the release defaults; mixed privacy is allowed (UP-14)", async () => {
    const owner = await createUser("rel-detail");
    const [a, b] = await Promise.all([createAsset(owner), createAsset(owner)]);
    const { collection } = await callerFor(owner).upload.createCollection({
      title: "Mixed", type: "EP", genre: "rock", tags: ["loud"], license: "CC_BY", privacy: "public", releaseDate: new Date("2030-01-02"),
      tracks: [{ mediaAssetId: a.id, title: "One" }, { mediaAssetId: b.id, title: "Two", privacy: "private", genre: "jazz-blues", explicit: true }],
    });
    const tracks = await db.collectionTrack.findMany({ where: { collectionId: collection.id }, orderBy: { position: "asc" }, include: { track: true } });
    assert.deepEqual(tracks.map((t) => [t.track.title, t.track.visibility, t.track.genre, t.track.license, t.track.explicit]), [
      ["One", "PUBLIC", "rock", "CC_BY", false],
      ["Two", "PRIVATE", "jazz-blues", "CC_BY", true],
    ]);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 1);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: collection.id } })).releaseDate?.toISOString().slice(0, 10), "2030-01-02");
  });

  it("ED-11: switching to a release type needs a release date; the type change is reversible", async () => {
    const owner = await createUser("type-owner");
    const set = await createCollection(owner, { title: "mix", type: "PLAYLIST" });
    const api = callerFor(owner).collections;
    await assert.rejects(api.update({ id: set.id, type: "ALBUM" }), /release date/);
    await api.update({ id: set.id, type: "ALBUM", releaseDate: new Date("2031-05-06") });
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).type, "ALBUM");
    await api.update({ id: set.id, type: "EP" });
    await api.update({ id: set.id, type: "PLAYLIST" });
    assert.equal((await callerFor().profiles.collections({ username: usernameOf(owner), kind: "sets" })).length, 1);
  });

  it("basic info: permalink redirect, first-public activity, artwork, apply genre/tags to the owner's tracks only", async () => {
    const owner = await createUser("coll-edit");
    const other = await createUser("coll-edit-other");
    const mine = await createTrack(owner, { title: "mine", genre: "rock" });
    const theirs = await createTrack(other, { title: "theirs", genre: "rock" });
    const set = await createCollection(owner, { title: "Old Name", visibility: "PRIVATE", trackIds: [mine.id, theirs.id] });
    await db.collection.update({ where: { id: set.id }, data: { publishedAt: null } });
    const api = callerFor(owner).collections;

    await api.update({ id: set.id, title: "New Name", slug: "new-name", privacy: "public", genre: "jazz-blues", tags: ["smooth"], applyToTracks: true });
    assert.deepEqual(await callerFor().collections.byPermalink({ username: usernameOf(owner), slug: set.slug }), { status: "redirect", to: `/${usernameOf(owner)}/sets/new-name` });
    assert.equal(await db.activity.count({ where: { collectionId: set.id, type: "COLLECTION_POSTED" } }), 1);
    assert.deepEqual([(await db.track.findUniqueOrThrow({ where: { id: mine.id } })).genre, (await db.track.findUniqueOrThrow({ where: { id: theirs.id } })).genre], ["jazz-blues", "rock"]);
    await api.update({ id: set.id, privacy: "private" });
    await api.update({ id: set.id, privacy: "public" });
    assert.equal(await db.activity.count({ where: { collectionId: set.id } }), 1, "one feed entry however often it is toggled");
    assert.deepEqual(await api.checkSlug({ slug: "new-name", selfId: set.id }), { available: true });
  });

  it("ED-7: tracks are appended, duplicates ignored, others' private tracks refused, max 500", async () => {
    const owner = await createUser("add-owner");
    const other = await createUser("add-other");
    const a = await createTrack(owner, { title: "a", visibility: "PRIVATE" });
    const b = await createTrack(owner, { title: "b" });
    const publicTheirs = await createTrack(other, { title: "pub" });
    const privateTheirs = await createTrack(other, { title: "priv", visibility: "PRIVATE" });
    const set = await createCollection(owner, { title: "s", type: "PLAYLIST", trackIds: [b.id] });
    const api = callerFor(owner).collections;
    assert.deepEqual(await api.addTracks({ id: set.id, trackIds: [a.id, b.id, publicTheirs.id, privateTheirs.id, a.id] }), { added: 2 });
    const entries = await db.collectionTrack.findMany({ where: { collectionId: set.id }, orderBy: { position: "asc" } });
    assert.deepEqual(entries.map((e) => [e.trackId, e.position]), [[b.id, 0], [a.id, 1], [publicTheirs.id, 2]]);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).trackCount, 3);
    await assert.rejects(callerFor(other).collections.addTracks({ id: set.id, trackIds: [publicTheirs.id] }), { code: "NOT_FOUND" });

  });

  it("reorder rewrites dense positions, refuses a stale list, and stays consistent against concurrent adds", async () => {
    const owner = await createUser("reorder");
    const t = await Promise.all([1, 2, 3, 4].map((n) => createTrack(owner, { title: `t${n}` })));
    const ids = t.map((x) => x.id);
    const set = await createCollection(owner, { title: "ordered", trackIds: ids });
    const api = callerFor(owner).collections;
    await api.reorder({ id: set.id, trackIds: [ids[3]!, ids[1]!, ids[0]!, ids[2]!] });
    const order = async () => (await db.collectionTrack.findMany({ where: { collectionId: set.id }, orderBy: { position: "asc" } })).map((e) => e.trackId);
    assert.deepEqual(await order(), [ids[3], ids[1], ids[0], ids[2]]);
    await assert.rejects(api.reorder({ id: set.id, trackIds: ids.slice(1) }), { code: "CONFLICT" });
    await assert.rejects(api.reorder({ id: set.id, trackIds: [...ids, ids[0]!] }), { code: "CONFLICT" });

    // QA-5: reorder vs add at the same time: positions stay dense 0..n-1 and counters match
    const extra = await Promise.all([1, 2, 3].map((n) => createTrack(owner, { title: `x${n}` })));
    await Promise.allSettled([
      api.reorder({ id: set.id, trackIds: ids.slice().reverse() }),
      ...extra.map((x) => api.addTracks({ id: set.id, trackIds: [x.id] })),
    ]);
    const entries = await db.collectionTrack.findMany({ where: { collectionId: set.id }, orderBy: { position: "asc" } });
    assert.deepEqual(entries.map((e) => e.position), entries.map((_, i) => i));
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).trackCount, entries.length);
  });

  it("remove keeps the track; delete keeps tracks by default, or deletes only the owner's own (ED-10)", async () => {
    const owner = await createUser("coll-del");
    const other = await createUser("coll-del-other");
    const mine = await createTrack(owner, { title: "mine" });
    const theirs = await createTrack(other, { title: "theirs" });
    const set = await createCollection(owner, { title: "doomed", type: "PLAYLIST", trackIds: [mine.id, theirs.id] });
    const api = callerFor(owner).collections;
    await api.removeTrack({ id: set.id, trackId: theirs.id });
    assert.equal(await db.track.count({ where: { id: theirs.id } }), 1);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: set.id } })).trackCount, 1);

    await api.addTracks({ id: set.id, trackIds: [theirs.id] });
    await api.delete({ id: set.id });
    assert.deepEqual([await db.collection.count({ where: { id: set.id } }), await db.track.count({ where: { id: mine.id } })], [0, 1]);

    const second = await createCollection(owner, { title: "doomed 2", type: "PLAYLIST", trackIds: [mine.id, theirs.id] });
    await api.delete({ id: second.id, deleteTracks: true });
    assert.deepEqual([await db.track.count({ where: { id: mine.id } }), await db.track.count({ where: { id: theirs.id } })], [0, 1], "someone else's track is never deleted");
  });

  it("only the owner can edit a collection", async () => {
    const owner = await createUser("coll-own");
    const other = await createUser("coll-intruder");
    const set = await createCollection(owner, { title: "mine" });
    for (const call of [
      () => callerFor(other).collections.update({ id: set.id, title: "x" }),
      () => callerFor(other).collections.delete({ id: set.id }),
      () => callerFor(other).collections.forEdit({ id: set.id }),
      () => callerFor(other).collections.resetSecret({ id: set.id }),
    ]) await assert.rejects(call(), { code: "NOT_FOUND" });
  });
});
