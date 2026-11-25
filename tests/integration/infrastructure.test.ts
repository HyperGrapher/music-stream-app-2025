import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import type { S3Client } from "@aws-sdk/client-s3";

import { MINUTE_MS } from "@/server/modules/plans/entitlements";
import { consumeRateLimit, enforceRateLimit, pruneRateLimitBuckets, RATE_LIMITS } from "@/server/modules/rate-limit";
import { sendEmail } from "@/server/modules/email";
import { passwordResetEmail, verificationEmail } from "@/server/modules/email/templates";
import { expireUnattachedAssets, removeAssetRows, runDailyHousekeeping } from "@/server/modules/housekeeping";
import { recountAll } from "@/server/modules/recount";
import { drainStorageDeletions, enqueueStorageDeletion } from "@/server/modules/storage/deletion";

import { callerFor, cleanup, createAsset, createCollection, createTrack, createUser, db, resetRateLimits } from "./helpers";

after(async () => {
  await cleanup();
  await db.storageDeletion.deleteMany({ where: { bucket: "infra-bucket" } });
  await db.$disconnect();
});
beforeEach(resetRateLimits);

/** Records which keys were asked to be deleted; fails for keys containing "boom". */
function fakeR2() {
  const deleted: string[] = [];
  const client = {
    send: async (command: { input: { Key: string } }) => {
      if (command.input.Key.includes("boom")) throw new Error("storage unavailable");
      deleted.push(command.input.Key);
      return {};
    },
  } as unknown as S3Client;
  return { client, deleted };
}

describe("rate limiter (14.3)", () => {
  it("allows up to max per window and reports when to retry", async () => {
    const rule = { max: 3, windowSeconds: 60 };
    const at = new Date("2030-01-01T00:00:10Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(db, "t-basic", rule, at));
    assert.deepEqual(results.map((r) => r.ok), [true, true, true, false]);
    assert.deepEqual(results.map((r) => r.remaining), [2, 1, 0, 0]);
    assert.equal(results[3]?.retryAfterSeconds, 50);
  });

  it("starts a fresh window, and keeps subjects and window sizes apart", async () => {
    const rule = { max: 1, windowSeconds: 60 };
    const at = new Date("2030-01-01T00:00:10Z");
    assert.equal((await consumeRateLimit(db, "t-win", rule, at)).ok, true);
    assert.equal((await consumeRateLimit(db, "t-win", rule, at)).ok, false);
    assert.equal((await consumeRateLimit(db, "t-win", rule, new Date(at.getTime() + MINUTE_MS))).ok, true);
    assert.equal((await consumeRateLimit(db, "t-other-subject", rule, at)).ok, true);
    assert.equal((await consumeRateLimit(db, "t-win", { max: 1, windowSeconds: 3600 }, at)).ok, true);
  });

  it("cannot be raced past its limit", async () => {
    const rule = { max: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 40 }, () => consumeRateLimit(db, "t-race", rule)));
    assert.equal(results.filter((r) => r.ok).length, 5);
  });

  it("enforceRateLimit throws TOO_MANY_REQUESTS carrying retryAfterSeconds", async () => {
    const rule = { max: 1, windowSeconds: 60 };
    await enforceRateLimit(db, "t-enforce", "user", rule);
    await assert.rejects(enforceRateLimit(db, "t-enforce", "user", rule), (error: { code?: string; cause?: { appCode?: string; extra?: { retryAfterSeconds?: number } } }) =>
      error.code === "TOO_MANY_REQUESTS" &&
      error.cause?.appCode === "RATE_LIMITED" &&
      (error.cause.extra?.retryAfterSeconds ?? 0) > 0,
    );
  });

  it("prunes buckets older than two days", async () => {
    const old = new Date(Date.now() - 3 * 86_400_000);
    await db.rateLimitBucket.create({ data: { key: "t-old|60", windowStart: old, count: 1 } });
    await db.rateLimitBucket.create({ data: { key: "t-new|60", windowStart: new Date(), count: 1 } });
    assert.equal(await pruneRateLimitBuckets(db), 1);
    assert.equal(await db.rateLimitBucket.count(), 1);
  });

  it("has a rule for every action PRD 14.3 lists", () => {
    for (const rule of Object.values(RATE_LIMITS)) assert.ok(rule.max > 0 && rule.windowSeconds > 0);
    assert.equal(RATE_LIMITS.commentPerMinute.max, 8);
    assert.equal(RATE_LIMITS.likePerMinute.max, 60);
    assert.equal(RATE_LIMITS.emailPerHour.max, 3);
  });
});

describe("durable storage deletion queue (3.2, 18.1)", () => {
  it("deletes queued objects and removes their rows", async () => {
    const { client, deleted } = fakeR2();
    await enqueueStorageDeletion(db, "infra-bucket", ["a/1.webp", "a/2.webp", "a/1.webp"]);
    assert.equal(await db.storageDeletion.count({ where: { bucket: "infra-bucket" } }), 2, "duplicates collapse");
    const result = await drainStorageDeletions(db, client, { limit: 10 });
    assert.equal(result.deleted, 2);
    assert.deepEqual(deleted.sort(), ["a/1.webp", "a/2.webp"]);
    assert.equal(await db.storageDeletion.count({ where: { bucket: "infra-bucket" } }), 0);
  });

  it("keeps failures queued with an attempt count, and recovers on the next drain", async () => {
    await enqueueStorageDeletion(db, "infra-bucket", ["boom/1.mp3"]);
    const failing = fakeR2();
    const first = await drainStorageDeletions(db, failing.client, { limit: 10 });
    assert.equal(first.failed, 1);
    const row = await db.storageDeletion.findFirstOrThrow({ where: { key: "boom/1.mp3" } });
    assert.equal(row.attempts, 1);
    assert.match(row.lastError ?? "", /storage unavailable/);
    // the object becomes deletable (renamed in the fake): the row is retried, not forgotten
    await db.storageDeletion.update({ where: { id: row.id }, data: { key: "fixed/1.mp3" } });
    const healthy = fakeR2();
    assert.equal((await drainStorageDeletions(db, healthy.client, { limit: 10 })).deleted, 1);
  });

  it("refuses to queue shared demo media", async () => {
    assert.equal(await enqueueStorageDeletion(db, "infra-bucket", ["demo/audio/01.mp3", "random-artwork-images/artwork-001.webp"]), 0);
    assert.equal(await db.storageDeletion.count({ where: { bucket: "infra-bucket" } }), 0);
  });

  it("removeAssetRows queues every rendition of an image and the waveform of audio, then drops the rows", async () => {
    const owner = await createUser("infra-assets");
    const audio = await createAsset(owner, { status: "READY" });
    const waveformKey = `waveforms/${owner}/${audio.id}/v1/overview.json`;
    const waveform = await db.mediaAsset.create({
      data: { ownerId: owner, kind: "WAVEFORM", status: "ATTACHED", bucket: "infra-bucket", storageKey: waveformKey, originalFilename: "overview.json", mimeType: "application/json" },
    });
    await db.audioAnalysis.update({ where: { audioAssetId: audio.id }, data: { overviewWaveformAssetId: waveform.id } });
    await db.mediaAsset.update({ where: { id: audio.id }, data: { bucket: "infra-bucket" } });
    const imageId = crypto.randomUUID();
    await db.mediaAsset.create({
      data: { id: imageId, ownerId: owner, kind: "IMAGE", imagePurpose: "ARTWORK", status: "READY", bucket: "infra-bucket", storageKey: `artworks/${owner}/${imageId}/640.webp`, imageWidths: [96, 320, 640], originalFilename: "c.jpg", mimeType: "image/webp" },
    });

    await removeAssetRows(db, [audio.id, imageId]);
    const queued = (await db.storageDeletion.findMany({ where: { bucket: "infra-bucket" } })).map((r) => r.key).sort();
    assert.deepEqual(queued, [
      audio.storageKey,
      `artworks/${owner}/${imageId}/320.webp`,
      `artworks/${owner}/${imageId}/640.webp`,
      `artworks/${owner}/${imageId}/96.webp`,
      waveformKey,
    ].sort());
    assert.equal(await db.mediaAsset.count({ where: { ownerId: owner } }), 0);
  });
});

describe("daily housekeeping (18.1)", () => {
  it("expires unattached uploads past 24 h but never attached ones", async () => {
    const owner = await createUser("infra-expire");
    const stale = await createAsset(owner, { status: "PENDING" });
    const fresh = await createAsset(owner, { status: "PENDING" });
    const attached = await createAsset(owner, { status: "ATTACHED" });
    const old = new Date(Date.now() - 25 * 3_600_000);
    await db.mediaAsset.updateMany({ where: { id: { in: [stale.id, attached.id] } }, data: { expiresAt: old } });
    await db.mediaAsset.update({ where: { id: fresh.id }, data: { expiresAt: new Date(Date.now() + 3_600_000) } });

    assert.equal(await expireUnattachedAssets(db, new Date()), 1);
    const left = (await db.mediaAsset.findMany({ where: { ownerId: owner } })).map((a) => a.id).sort();
    assert.deepEqual(left, [fresh.id, attached.id].sort());
    assert.ok(await db.storageDeletion.findFirst({ where: { key: stale.storageKey } }));
    await db.storageDeletion.deleteMany({ where: { key: stale.storageKey } });
  });

  it("runs every task, is idempotent and reports counts", async () => {
    const { client } = fakeR2();
    const first = await runDailyHousekeeping(db, client);
    const second = await runDailyHousekeeping(db, client);
    assert.equal(typeof first.expiredAssets, "number");
    assert.equal(second.expiredAssets, 0);
  });

  it("prunes stored email bodies after 7 days but keeps the audit row", async () => {
    const row = await db.emailMessage.create({
      data: { to: "old@example.test", template: "t", subject: "s", status: "LOGGED", bodyHtml: "<p>x</p>", createdAt: new Date(Date.now() - 8 * 86_400_000) },
    });
    await runDailyHousekeeping(db, fakeR2().client);
    const after = await db.emailMessage.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.bodyHtml, null);
    await db.emailMessage.delete({ where: { id: row.id } });
  });
});

describe("email (6.1, QA-4)", () => {
  it("without an API key the email is stored as LOGGED so tests can follow its link", async () => {
    const message = await sendEmail(db, verificationEmail("new@example.test", "Ana", "http://localhost/verify?token=abc"));
    assert.equal(message.status, "LOGGED");
    assert.match(message.bodyHtml ?? "", /verify\?token=abc/);
    await db.emailMessage.delete({ where: { id: message.id } });
  });

  it("escapes user-controlled values in templates (SC-2)", () => {
    const mail = passwordResetEmail("x@example.test", `<img src=x onerror=alert(1)>`, "http://localhost/reset");
    assert.ok(!mail.html.includes("<img"), "name must be escaped");
    assert.match(mail.html, /&lt;img/);
  });
});

describe("recountAll (16.4)", () => {
  it("repairs every counter and rebuilds daily stats from the rows", async () => {
    const owner = await createUser("infra-recount");
    const fan = await createUser("infra-recount-fan");
    const track = await createTrack(owner, { title: "counted", playCount: 99, likeCount: 99 });
    const set = await createCollection(owner, { title: "set", trackIds: [track.id] });
    await db.trackLike.create({ data: { userId: fan, trackId: track.id } });
    await db.follow.create({ data: { followerId: fan, followingId: owner } });
    await db.playEvent.create({ data: { trackId: track.id, collectionId: set.id, listenerId: fan, counted: true } });
    await db.playEvent.create({ data: { trackId: track.id, listenerId: owner, counted: false } });
    await db.comment.create({ data: { authorId: fan, trackId: track.id, content: "hi" } });
    await db.collection.update({ where: { id: set.id }, data: { trackCount: 42, durationMs: 1 } });

    await recountAll(db);

    const t = await db.track.findUniqueOrThrow({ where: { id: track.id } });
    assert.deepEqual([t.playCount, t.likeCount, t.commentCount, t.repostCount], [1, 1, 1, 0]);
    const c = await db.collection.findUniqueOrThrow({ where: { id: set.id } });
    assert.deepEqual([c.trackCount, c.durationMs, c.playCount], [1, 30_000, 1]);
    const u = await db.user.findUniqueOrThrow({ where: { id: owner } });
    assert.deepEqual([u.followerCount, u.publicTrackCount], [1, 1]);
    const stat = await db.trackDailyStat.findFirstOrThrow({ where: { trackId: track.id } });
    assert.deepEqual([stat.plays, stat.likes, stat.comments], [1, 1, 1]);
  });
});

describe("tRPC error shape", () => {
  it("is reachable as an anonymous caller for public procedures only", async () => {
    await assert.rejects(callerFor().upload.getUploadUrl({ filename: "a.mp3", contentType: "audio/mpeg", fileSize: 10 }), { code: "UNAUTHORIZED" });
  });
});
