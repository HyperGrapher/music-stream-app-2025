import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { COMMENT_RATE_LIMIT, commentLockKey } from "@/server/modules/tracks/comments";

import { callerFor, cleanup, createAsset, createUser, db } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

/** A track with a known 30 s duration. */
async function newTrack(visibility: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PUBLIC") {
  const owner = await createUser("c-owner");
  const asset = await createAsset(owner, { status: "ATTACHED" });
  await db.audioAnalysis.create({ data: { audioAssetId: asset.id, status: "READY", durationMs: 30_000 } });
  const track = await db.track.create({
    data: { creatorId: owner, audioAssetId: asset.id, title: "commented", visibility },
  });
  return { owner, trackId: track.id };
}

/** The invariant everything rests on: the counter equals the rows it summarises. */
async function assertConsistent(trackId: string) {
  const track = await db.track.findUniqueOrThrow({ where: { id: trackId } });
  assert.equal(track.commentCount, await db.comment.count({ where: { trackId } }));
  return track.commentCount;
}

describe("comments.create", () => {
  it("stores the exact second of the track and lists it, newest first", async () => {
    const { trackId } = await newTrack();
    const fan = await createUser("fan");
    const api = callerFor(fan).comments;

    const first = await api.create({ trackId, content: "  drop at 12!  ", timestampSeconds: 12 });
    assert.equal(first.timestampSeconds, 12);
    assert.equal(first.content, "drop at 12!"); // trimmed
    await api.create({ trackId, content: "nice track overall" }); // general comment

    const { comments, total } = await callerFor().comments.list({ trackId });
    assert.equal(total, 2);
    assert.deepEqual(comments.map((c) => c.content), ["nice track overall", "drop at 12!"]);
    assert.deepEqual(comments.map((c) => c.timestampSeconds), [null, 12]);
    assert.equal(comments[1]?.author.id, fan);
    assert.equal(await assertConsistent(trackId), 2);
  });

  it("only accepts whole seconds inside the track (the very end is allowed)", async () => {
    const { trackId } = await newTrack();
    const api = callerFor(await createUser("timed")).comments;
    await api.create({ trackId, content: "start", timestampSeconds: 0 });
    await api.create({ trackId, content: "end", timestampSeconds: 30 });
    for (const bad of [31, -1, 1.5, Number.NaN]) {
      await assert.rejects(api.create({ trackId, content: "x", timestampSeconds: bad }), `timestamp ${bad}`);
    }
    assert.equal(await assertConsistent(trackId), 2);
  });

  it("threads replies one level deep and attaches replies-to-replies to the root", async () => {
    const { trackId } = await newTrack();
    const [a, b] = await Promise.all([createUser("a"), createUser("b")]);
    const root = await callerFor(a).comments.create({ trackId, content: "root", timestampSeconds: 5 });
    const reply = await callerFor(b).comments.create({ trackId, content: "reply", parentId: root.id });
    const nested = await callerFor(a).comments.create({ trackId, content: "reply to reply", parentId: reply.id });
    assert.equal(reply.parentId, root.id);
    assert.equal(nested.parentId, root.id);

    const { comments } = await callerFor().comments.list({ trackId });
    assert.equal(comments.length, 1);
    assert.deepEqual(comments[0]?.replies.map((r) => r.content), ["reply", "reply to reply"]);
    assert.equal(await assertConsistent(trackId), 3);
  });

  it("rejects timestamps on replies and parents from another track", async () => {
    const one = await newTrack();
    const two = await newTrack();
    const user = await createUser("threader");
    const root = await callerFor(user).comments.create({ trackId: one.trackId, content: "root" });
    await assert.rejects(
      callerFor(user).comments.create({ trackId: one.trackId, content: "r", parentId: root.id, timestampSeconds: 3 }),
      { code: "BAD_REQUEST" },
    );
    await assert.rejects(
      callerFor(user).comments.create({ trackId: two.trackId, content: "r", parentId: root.id }),
      { code: "NOT_FOUND" },
    );
  });

  it("validates content and requires sign-in", async () => {
    const { trackId } = await newTrack();
    const user = await createUser("validator");
    await assert.rejects(callerFor(user).comments.create({ trackId, content: "   " }));
    await assert.rejects(callerFor(user).comments.create({ trackId, content: "x".repeat(1001) }));
    await callerFor(user).comments.create({ trackId, content: "x".repeat(1000) });
    await assert.rejects(callerFor().comments.create({ trackId, content: "hi" }), { code: "UNAUTHORIZED" });
    assert.equal(await assertConsistent(trackId), 1);
  });

  it("follows track visibility: private tracks are the owner's only", async () => {
    const priv = await newTrack("PRIVATE");
    const stranger = await createUser("stranger");
    await assert.rejects(callerFor(stranger).comments.create({ trackId: priv.trackId, content: "hi" }), { code: "NOT_FOUND" });
    await callerFor(priv.owner).comments.create({ trackId: priv.trackId, content: "my own note", timestampSeconds: 1 });
    assert.deepEqual((await callerFor(stranger).comments.list({ trackId: priv.trackId })).comments, []);
    assert.equal((await callerFor(priv.owner).comments.list({ trackId: priv.trackId })).comments.length, 1);

    const unlisted = await newTrack("UNLISTED");
    await callerFor(stranger).comments.create({ trackId: unlisted.trackId, content: "via the link" });
    assert.equal(await assertConsistent(unlisted.trackId), 1);
  });

  it("rate limits a flood from one author", async () => {
    const { trackId } = await newTrack();
    const spammer = await createUser("spammer");
    const api = callerFor(spammer).comments;
    for (let i = 0; i < COMMENT_RATE_LIMIT.max; i++) await api.create({ trackId, content: `c${i}` });
    await assert.rejects(api.create({ trackId, content: "one too many" }), { code: "TOO_MANY_REQUESTS" });
    assert.equal(await assertConsistent(trackId), COMMENT_RATE_LIMIT.max);
  });

  it("keeps the counter exact under concurrent posting", async () => {
    const { trackId } = await newTrack();
    const users = await Promise.all(Array.from({ length: 24 }, (_, i) => createUser(`burst-${i}`)));
    await Promise.all(users.map((u) => callerFor(u).comments.create({ trackId, content: "hello", timestampSeconds: 2 })));
    assert.equal(await assertConsistent(trackId), 24);
  });
});

describe("comments.delete", () => {
  it("lets authors and the track's creator remove comments, and nobody else", async () => {
    const { owner, trackId } = await newTrack();
    const [a, b, stranger] = await Promise.all([createUser("a"), createUser("b"), createUser("s")]);
    const mine = await callerFor(a).comments.create({ trackId, content: "mine" });
    const theirs = await callerFor(b).comments.create({ trackId, content: "theirs" });

    await assert.rejects(callerFor(stranger).comments.delete({ commentId: mine.id }), { code: "FORBIDDEN" });
    await callerFor(a).comments.delete({ commentId: mine.id });
    await callerFor(owner).comments.delete({ commentId: theirs.id }); // moderation
    await assert.rejects(callerFor(a).comments.delete({ commentId: mine.id }), { code: "NOT_FOUND" });
    assert.equal(await assertConsistent(trackId), 0);
  });

  it("flags who may delete what, per viewer", async () => {
    const { owner, trackId } = await newTrack();
    const [a, b] = await Promise.all([createUser("flag-a"), createUser("flag-b")]);
    await callerFor(a).comments.create({ trackId, content: "by a" });
    const flags = async (viewer?: string) =>
      (await callerFor(viewer).comments.list({ trackId })).comments[0]?.canDelete;
    assert.equal(await flags(a), true);
    assert.equal(await flags(owner), true);
    assert.equal(await flags(b), false);
    assert.equal(await flags(undefined), false);
  });

  it("removes a whole thread and lowers the counter by exactly its size", async () => {
    const { trackId } = await newTrack();
    const [a, b] = await Promise.all([createUser("t-a"), createUser("t-b")]);
    const root = await callerFor(a).comments.create({ trackId, content: "root" });
    await callerFor(b).comments.create({ trackId, content: "r1", parentId: root.id });
    await callerFor(b).comments.create({ trackId, content: "r2", parentId: root.id });
    await callerFor(a).comments.create({ trackId, content: "separate" });
    assert.equal(await assertConsistent(trackId), 4);

    assert.deepEqual(await callerFor(a).comments.delete({ commentId: root.id }), { removed: 3 });
    assert.equal(await assertConsistent(trackId), 1);
  });

  it("serialises writes per track: create and delete wait for the track's lock, other tracks do not", async () => {
    // Deterministic proof of the locking contract (the race itself is too narrow to hit reliably).
    const { trackId } = await newTrack();
    const other = await newTrack();
    const user = await createUser("lock-user");
    const existing = await callerFor(user).comments.create({ trackId, content: "existing" });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let taken!: () => void;
    const lockTaken = new Promise<void>((resolve) => (taken = resolve));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${commentLockKey(trackId)}, 0))`;
        taken();
        await gate;
      },
      { timeout: 20_000 },
    );
    await lockTaken;

    let createDone = false;
    let deleteDone = false;
    const create = callerFor(user).comments.create({ trackId, content: "waits" }).then(() => (createDone = true));
    const remove = callerFor(user).comments.delete({ commentId: existing.id }).then(() => (deleteDone = true));
    // A different track is unaffected by the held lock.
    await callerFor(user).comments.create({ trackId: other.trackId, content: "free" });

    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(createDone, false, "create must wait for the track lock");
    assert.equal(deleteDone, false, "delete must wait for the track lock");

    release();
    await holder;
    await Promise.all([create, remove]);
    assert.equal(await assertConsistent(trackId), 1); // "existing" deleted, "waits" created
    assert.equal(await assertConsistent(other.trackId), 1);
  });

  it("stays consistent when a thread is deleted while replies are still arriving", async () => {
    // Without the per-track lock, a reply landing between the delete's reply count and its
    // cascade makes the counter overshoot the rows. The window is tiny, so fan out hard and
    // repeat: many repliers (distinct users, so the rate limit does not serialise them).
    const repliers = await Promise.all(Array.from({ length: 6 }, (_, i) => createUser(`storm-${i}`)));
    for (let round = 0; round < 15; round++) {
      const { owner, trackId } = await newTrack();
      const root = await callerFor(owner).comments.create({ trackId, content: "root" });
      const replyCalls = repliers.flatMap((replier, r) =>
        Array.from({ length: 4 }, (_, i) =>
          callerFor(replier).comments.create({ trackId, content: `r${r}-${i}`, parentId: root.id }),
        ),
      );
      await Promise.allSettled([...replyCalls, callerFor(owner).comments.delete({ commentId: root.id })]);
      await assertConsistent(trackId); // counter == rows, whichever replies made it in
      // rate limit is per author per minute: let the repliers start fresh each round
      await db.comment.updateMany({
        where: { authorId: { in: repliers } },
        data: { createdAt: new Date(Date.now() - 10 * 60_000) },
      });
    }
  });
});
