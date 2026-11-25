import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createUser, db } from "./helpers";

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

  it("rolls the audio claim back when the artwork is not ready", async () => {
    const owner = await createUser("rollback-track");
    const audio = await createAsset(owner);
    const artwork = await createAsset(owner, { kind: "IMAGE", status: "PENDING" });

    await assert.rejects(
      callerFor(owner).upload.createTrack(
        trackInput(audio.id, { artworkAssetId: artwork.id }),
      ),
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

describe("createRelease", () => {
  const releaseInput = (tracks: { mediaAssetId: string; title: string }[], extra = {}) => ({
    title: "R",
    tracks,
    genre: "electronic",
    privacy: "public" as const,
    releaseType: "EP" as const,
    ...extra,
  });

  it("publishes ordered tracks and attaches every asset", async () => {
    const owner = await createUser("release");
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => createAsset(owner)));
    const { release } = await callerFor(owner).upload.createRelease(
      releaseInput([
        { mediaAssetId: b!.id, title: "second-uploaded, first-listed" },
        { mediaAssetId: c!.id, title: "second" },
        { mediaAssetId: a!.id, title: "third" },
      ]),
    );

    const entries = await db.releaseTrack.findMany({
      where: { releaseId: release.id },
      orderBy: { position: "asc" },
      include: { track: true },
    });
    assert.deepEqual(entries.map((e) => e.track.title), [
      "second-uploaded, first-listed",
      "second",
      "third",
    ]);
    const statuses = await db.mediaAsset.findMany({ where: { ownerId: owner } });
    assert.ok(statuses.every((s) => s.status === "ATTACHED"));
  });

  it("rolls everything back when one asset belongs to someone else", async () => {
    const owner = await createUser("rollback-release");
    const other = await createUser("other");
    const mine = await createAsset(owner);
    const theirs = await createAsset(other);

    await assert.rejects(
      callerFor(owner).upload.createRelease(
        releaseInput([
          { mediaAssetId: mine.id, title: "mine" },
          { mediaAssetId: theirs.id, title: "theirs" },
        ]),
      ),
    );

    assert.equal(await db.release.count({ where: { creatorId: owner } }), 0);
    assert.equal(await db.track.count({ where: { creatorId: owner } }), 0);
    const after = await db.mediaAsset.findUniqueOrThrow({ where: { id: mine.id } });
    assert.equal(after.status, "READY");
  });

  it("rejects the same file twice in one release", async () => {
    const owner = await createUser("dup");
    const asset = await createAsset(owner);
    await assert.rejects(
      callerFor(owner).upload.createRelease(
        releaseInput([
          { mediaAssetId: asset.id, title: "one" },
          { mediaAssetId: asset.id, title: "two" },
        ]),
      ),
    );
    assert.equal(await db.track.count({ where: { creatorId: owner } }), 0);
  });
});
