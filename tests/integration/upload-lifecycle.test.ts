import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createUser, db, usernameOf } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

const trackInput = (mediaAssetId: string, extra = {}) => ({
  title: "T",
  mediaAssetId,
  genre: "electronic",
  privacy: "public" as const,
  ...extra,
});

describe("createTrack", () => {
  it("lets exactly one of two concurrent publishes claim an asset", async () => {
    const owner = await createUser("race");
    const asset = await createAsset(owner);
    const api = callerFor(owner);

    const results = await Promise.allSettled([
      api.upload.createTrack(trackInput(asset.id, { title: "A" })),
      api.upload.createTrack(trackInput(asset.id, { title: "B" })),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal(await db.track.count({ where: { audioAssetId: asset.id } }), 1);
    const after = await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(after.status, "ATTACHED");
  });

  it("creates a permalink, a secret link, the duration and an activity row", async () => {
    const owner = await createUser("publish");
    const asset = await createAsset(owner, { durationMs: 61_000 });
    const { track, permalink } = await callerFor(owner).upload.createTrack(
      trackInput(asset.id, { title: "Gitarda Bir Riff #4!", tags: ["Lo-Fi", "lo-fi", "chill"] }),
    );
    assert.equal(track.slug, "gitarda-bir-riff-4");
    assert.equal(permalink, `/${usernameOf(owner)}/gitarda-bir-riff-4`);
    const row = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.equal(row.secretToken.length, 22);
    assert.equal(row.durationMs, 61_000);
    assert.equal(row.mimeType, "audio/mpeg");
    assert.deepEqual(row.tags, ["lo-fi", "chill"]);
    assert.ok(row.publishedAt, "public tracks are published immediately");
    assert.equal(await db.activity.count({ where: { trackId: track.id, type: "TRACK_POSTED" } }), 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 1);
  });

  it("IA-2: slugs are unique per creator and get -2, -3 on collision; other creators may reuse them", async () => {
    const owner = await createUser("slugs");
    const other = await createUser("slugs-other");
    const slugs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const asset = await createAsset(owner);
      slugs.push((await callerFor(owner).upload.createTrack(trackInput(asset.id, { title: "Same Title" }))).track.slug);
    }
    assert.deepEqual(slugs, ["same-title", "same-title-2", "same-title-3"]);
    const asset = await createAsset(other);
    assert.equal((await callerFor(other).upload.createTrack(trackInput(asset.id, { title: "Same Title" }))).track.slug, "same-title");
  });

  it("IA-2: titles that collide with profile sub-routes get a safe slug", async () => {
    const owner = await createUser("reserved-slug");
    const asset = await createAsset(owner);
    const { track } = await callerFor(owner).upload.createTrack(trackInput(asset.id, { title: "Albums" }));
    assert.equal(track.slug, "albums-1");
  });

  it("private tracks are not published: no publishedAt, no activity", async () => {
    const owner = await createUser("private-publish");
    const asset = await createAsset(owner);
    const { track } = await callerFor(owner).upload.createTrack(trackInput(asset.id, { privacy: "private" }));
    const row = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.deepEqual([row.visibility, row.publishedAt], ["PRIVATE", null]);
    assert.equal(await db.activity.count({ where: { trackId: track.id } }), 0);
  });

  it("refuses another user's asset and leaves it untouched", async () => {
    const owner = await createUser("owner");
    const intruder = await createUser("intruder");
    const asset = await createAsset(owner);

    await assert.rejects(callerFor(intruder).upload.createTrack(trackInput(asset.id)));

    const after = await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(after.status, "READY");
    assert.equal(await db.track.count({ where: { audioAssetId: asset.id } }), 0);
  });

  it("refuses an asset that has not finished uploading", async () => {
    const owner = await createUser("pending");
    const asset = await createAsset(owner, { status: "PENDING" });
    await assert.rejects(callerFor(owner).upload.createTrack(trackInput(asset.id)));
  });

  it("UP-F2: refuses audio without a successful analysis", async () => {
    const owner = await createUser("no-analysis");
    const asset = await createAsset(owner);
    await db.audioAnalysis.update({ where: { audioAssetId: asset.id }, data: { status: "FAILED", durationMs: null } });
    await assert.rejects(callerFor(owner).upload.createTrack(trackInput(asset.id)), /not been analysed/);
    assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).status, "READY");
  });

  it("rolls the audio claim back when the artwork is not ready", async () => {
    const owner = await createUser("rollback-track");
    const audio = await createAsset(owner);
    const artwork = await createAsset(owner, { kind: "IMAGE", status: "PENDING" });

    await assert.rejects(
      callerFor(owner).upload.createTrack(trackInput(audio.id, { artworkAssetId: artwork.id })),
    );

    const after = await db.mediaAsset.findUniqueOrThrow({ where: { id: audio.id } });
    assert.equal(after.status, "READY");
    assert.equal(await db.track.count({ where: { creatorId: owner } }), 0);
  });

  it("requires authentication", async () => {
    await assert.rejects(
      callerFor().upload.createTrack(trackInput(crypto.randomUUID())),
      /UNAUTHORIZED/,
    );
  });
});

describe("createCollection", () => {
  const collectionInput = (tracks: { mediaAssetId: string; title: string }[], extra = {}) => ({
    title: "R",
    tracks,
    genre: "electronic",
    privacy: "public" as const,
    type: "EP" as const,
    ...extra,
  });

  it("publishes ordered tracks, attaches every asset and posts one activity for the release", async () => {
    const owner = await createUser("release");
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => createAsset(owner)));
    const { collection, permalink } = await callerFor(owner).upload.createCollection(
      collectionInput([
        { mediaAssetId: b!.id, title: "second-uploaded, first-listed" },
        { mediaAssetId: c!.id, title: "second" },
        { mediaAssetId: a!.id, title: "third" },
      ]),
    );
    assert.equal(permalink, `/${usernameOf(owner)}/sets/${collection.slug}`);

    const entries = await db.collectionTrack.findMany({
      where: { collectionId: collection.id },
      orderBy: { position: "asc" },
      include: { track: true },
    });
    assert.deepEqual(entries.map((e) => e.track.title), ["second-uploaded, first-listed", "second", "third"]);
    assert.deepEqual(entries.map((e) => e.position), [0, 1, 2]);
    const statuses = await db.mediaAsset.findMany({ where: { ownerId: owner } });
    assert.ok(statuses.every((s) => s.status === "ATTACHED"));

    const row = await db.collection.findUniqueOrThrow({ where: { id: collection.id } });
    assert.deepEqual([row.trackCount, row.durationMs, row.type], [3, 360_000, "EP"]);
    assert.ok(row.releaseDate, "release types always carry a release date");
    assert.equal(await db.activity.count({ where: { actorId: owner } }), 1);
    assert.equal(await db.activity.count({ where: { collectionId: collection.id, type: "COLLECTION_POSTED" } }), 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner } })).publicTrackCount, 3);
  });

  it("the release artwork is used by tracks without their own", async () => {
    const owner = await createUser("release-art");
    const track = await createAsset(owner);
    const artwork = await createAsset(owner, { kind: "IMAGE", status: "READY" });
    const { collection } = await callerFor(owner).upload.createCollection(
      collectionInput([{ mediaAssetId: track.id, title: "only" }], { artworkAssetId: artwork.id }),
    );
    const stored = await db.collection.findUniqueOrThrow({ where: { id: collection.id } });
    const entry = await db.collectionTrack.findFirstOrThrow({ where: { collectionId: collection.id }, include: { track: true } });
    assert.equal(stored.artworkAssetId, artwork.id);
    assert.equal(entry.track.artworkAssetId, artwork.id);
  });

  it("rolls everything back when one asset belongs to someone else", async () => {
    const owner = await createUser("rollback-release");
    const other = await createUser("other");
    const mine = await createAsset(owner);
    const theirs = await createAsset(other);

    await assert.rejects(
      callerFor(owner).upload.createCollection(
        collectionInput([
          { mediaAssetId: mine.id, title: "mine" },
          { mediaAssetId: theirs.id, title: "theirs" },
        ]),
      ),
    );

    assert.equal(await db.collection.count({ where: { ownerId: owner } }), 0);
    assert.equal(await db.track.count({ where: { creatorId: owner } }), 0);
    const after = await db.mediaAsset.findUniqueOrThrow({ where: { id: mine.id } });
    assert.equal(after.status, "READY");
  });

  it("rejects the same file twice in one release", async () => {
    const owner = await createUser("dup");
    const asset = await createAsset(owner);
    await assert.rejects(
      callerFor(owner).upload.createCollection(
        collectionInput([
          { mediaAssetId: asset.id, title: "one" },
          { mediaAssetId: asset.id, title: "two" },
        ]),
      ),
    );
    assert.equal(await db.track.count({ where: { creatorId: owner } }), 0);
  });

  it("two collections with the same title get distinct slugs", async () => {
    const owner = await createUser("set-slugs");
    const slugs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const asset = await createAsset(owner);
      const { collection } = await callerFor(owner).upload.createCollection(
        collectionInput([{ mediaAssetId: asset.id, title: `t${i}` }], { title: "Night Drive" }),
      );
      slugs.push(collection.slug);
    }
    assert.deepEqual(slugs, ["night-drive", "night-drive-2"]);
  });
});
