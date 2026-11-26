import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { changeUsername, checkUsername } from "@/server/modules/accounts";
import { markAccountDeleted, purgeAccountContent, purgeDeletedAccounts } from "@/server/modules/accounts/deletion";
import { whoToFollow } from "@/server/modules/accounts/suggestions";

import { callerFor, cleanup, createAsset, createTrack, createUser, db, resetRateLimits, usernameOf, withAppCode,
} from "./helpers";

after(async () => {
  await cleanup();
  await db.storageDeletion.deleteMany({ where: { bucket: "test-bucket" } });
  await db.$disconnect();
});
beforeEach(resetRateLimits);

describe("usernames (6.2, IA-1, IA-4)", () => {
  it("checkUsername reports shape, reserved words and conflicts, with free suggestions", async () => {
    const taken = await createUser("taken");
    const me = await createUser("me");
    const name = usernameOf(taken);
    assert.deepEqual(await checkUsername(db, "ab", me), { available: false, username: "ab", reason: "INVALID", suggestions: [] });
    assert.equal((await checkUsername(db, "Settings", me)).available, false);
    assert.equal((await checkUsername(db, "has space", me)).available, false);
    const conflict = await checkUsername(db, name.toUpperCase(), me);
    assert.equal(conflict.available, false);
    if (!conflict.available) {
      assert.equal(conflict.reason, "TAKEN");
      assert.ok(conflict.suggestions.length > 0 && conflict.suggestions.every((s) => s !== name));
    }
    assert.equal((await checkUsername(db, name, taken)).available, true, "your own name is always available to you");
    assert.equal((await checkUsername(db, `fresh-${crypto.randomUUID().slice(0, 8)}`, me)).available, true);
  });

  it("renaming keeps the old name redirecting, holds it for its owner, and can be undone", async () => {
    const [a, b] = await Promise.all([createUser("rename-a"), createUser("rename-b")]);
    const original = usernameOf(a);
    const renamed = `new-${crypto.randomUUID().slice(0, 8)}`;
    await changeUsername(db, a, renamed);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: a } })).username, renamed);
    assert.deepEqual(await callerFor().profiles.byUsername({ username: original }), { status: "redirect", to: `/${renamed}` });

    // someone else cannot take the held name within 30 days...
    await assert.rejects(changeUsername(db, b, original), { code: "CONFLICT" });
    // ...but after 30 days it is free again
    await db.usernameRedirect.update({ where: { oldUsername: original }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    assert.equal((await checkUsername(db, original, b)).available, true);
    await db.usernameRedirect.update({ where: { oldUsername: original }, data: { createdAt: new Date() } });

    // the owner can take their old name back, which removes its redirect
    await changeUsername(db, a, original);
    assert.equal(await db.usernameRedirect.count({ where: { oldUsername: original } }), 0);
    assert.equal((await db.usernameRedirect.findUniqueOrThrow({ where: { oldUsername: renamed } })).userId, a);
  });

  it("profile update validates and renames through the same rules", async () => {
    const me = await createUser("profile");
    const other = await createUser("profile-other");
    await assert.rejects(callerFor(me).account.updateProfile({ username: usernameOf(other) }), { code: "CONFLICT" });
    await assert.rejects(callerFor(me).account.updateProfile({ username: "admin" }), { code: "BAD_REQUEST" });
    const result = await callerFor(me).account.updateProfile({
      name: "New Name", bio: "hello", city: "Berlin", countryCode: "de",
      links: [{ url: "https://example.com/me", title: "Site" }],
    });
    assert.equal(result.username, usernameOf(me));
    const row = await db.user.findUniqueOrThrow({ where: { id: me }, include: { profileLinks: true } });
    assert.deepEqual([row.name, row.bio, row.city, row.countryCode, row.profileLinks.length], ["New Name", "hello", "Berlin", "DE", 1]);
    await assert.rejects(callerFor(me).account.updateProfile({ links: Array.from({ length: 11 }, () => ({ url: "https://example.com" })) }));
    await assert.rejects(callerFor(me).account.updateProfile({ links: [{ url: "javascript:alert(1)" }] }));
  });
});

describe("onboarding (6.2)", () => {
  it("sets username, name, genres, follows and marks the account onboarded", async () => {
    const [me, c1, c2] = await Promise.all([createUser("onb"), createUser("onb-c1"), createUser("onb-c2")]);
    const username = `onb-${crypto.randomUUID().slice(0, 8)}`;
    await callerFor(me).account.completeOnboarding({
      username, name: "Onboarded Ana", genres: ["rock", "jazz-blues", "techno"], follow: [c1, c2, me, crypto.randomUUID()],
    });
    const row = await db.user.findUniqueOrThrow({ where: { id: me } });
    assert.deepEqual([row.username, row.name, row.favoriteGenres, row.followingCount], [username, "Onboarded Ana", ["rock", "jazz-blues", "techno"], 2]);
    assert.ok(row.onboardedAt, "onboardedAt is set (self and unknown follows were skipped, not fatal)");
  });

  it("needs at least 3 genres and a free username", async () => {
    const me = await createUser("onb-bad");
    const base = { name: "X", follow: [] as string[] };
    await assert.rejects(callerFor(me).account.completeOnboarding({ ...base, username: `ok-${crypto.randomUUID().slice(0, 6)}`, genres: ["rock", "pop"] }));
    await assert.rejects(callerFor(me).account.completeOnboarding({ ...base, username: usernameOf(await createUser("onb-taken")), genres: ["rock", "pop", "jazz-blues"] }), { code: "CONFLICT" });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: me } })).onboardedAt, null);
  });

  it("an avatar must be this user's READY AVATAR image, and replacing it queues the old one for deletion", async () => {
    const me = await createUser("avatar");
    const other = await createUser("avatar-other");
    const image = async (owner: string, purpose: "AVATAR" | "ARTWORK", status: "READY" | "PENDING" = "READY") => {
      const asset = await createAsset(owner, { kind: "IMAGE", status });
      return db.mediaAsset.update({ where: { id: asset.id }, data: { imagePurpose: purpose, imageWidths: [64, 160, 320], storageKey: `avatars/${owner}/${asset.id}/320.webp` } });
    };
    await assert.rejects(callerFor(me).account.updateProfile({ avatarAssetId: (await image(other, "AVATAR")).id }), { code: "CONFLICT" });
    await assert.rejects(callerFor(me).account.updateProfile({ avatarAssetId: (await image(me, "ARTWORK")).id }), { code: "CONFLICT" });
    await assert.rejects(callerFor(me).account.updateProfile({ avatarAssetId: (await image(me, "AVATAR", "PENDING")).id }), { code: "CONFLICT" });

    const first = await image(me, "AVATAR");
    await callerFor(me).account.updateProfile({ avatarAssetId: first.id });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: me } })).avatarAssetId, first.id);
    assert.equal((await db.mediaAsset.findUniqueOrThrow({ where: { id: first.id } })).status, "ATTACHED");

    const second = await image(me, "AVATAR");
    await callerFor(me).account.updateProfile({ avatarAssetId: second.id });
    assert.equal(await db.mediaAsset.count({ where: { id: first.id } }), 0);
    const queued = (await db.storageDeletion.findMany({ where: { key: { startsWith: `avatars/${me}/${first.id}/` } } })).map((r) => r.key.split("/").pop());
    assert.deepEqual(queued.sort(), ["160.webp", "320.webp", "64.webp"]);
  });
});

describe("verified email gate (AU-4)", () => {
  it("unverified users can listen and like but cannot upload or comment", async () => {
    const unverified = await createUser("unverified", { emailVerified: false });
    const owner = await createUser("gate-owner");
    const track = await createTrack(owner, { title: "gate" });
    const asset = await createAsset(unverified);
    const gated = withAppCode("EMAIL_NOT_VERIFIED");
    await assert.rejects(callerFor(unverified).comments.create({ trackId: track.id, content: "hi" }), gated);
    await assert.rejects(callerFor(unverified).upload.createTrack({ title: "T", mediaAssetId: asset.id, genre: "rock", privacy: "public" }), gated);
    await assert.rejects(callerFor(unverified).upload.getUploadUrl({ filename: "a.mp3", contentType: "audio/mpeg", fileSize: 10 }), gated);
    await callerFor(unverified).engagement.setTrackLike({ trackId: track.id, liked: true });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).likeCount, 1);

    // verifying takes effect immediately (the gate reads the database, not the cached session)
    await db.user.update({ where: { id: unverified }, data: { emailVerified: true } });
    await callerFor(unverified).comments.create({ trackId: track.id, content: "now I can" });
  });
});

describe("account deletion (AU-10)", () => {
  it("hides the account at once, then removes its content and recounts what it touched", async () => {
    const [victim, other] = await Promise.all([createUser("victim"), createUser("survivor")]);
    const victimTrack = await createTrack(victim, { title: "going away" });
    const otherTrack = await createTrack(other, { title: "staying" });
    await callerFor(victim).engagement.setTrackLike({ trackId: otherTrack.id, liked: true });
    await callerFor(other).engagement.setTrackLike({ trackId: victimTrack.id, liked: true });
    await callerFor(victim).engagement.setFollow({ userId: other, follow: true });
    await db.comment.create({ data: { authorId: victim, trackId: otherTrack.id, content: "bye" } });
    await db.track.update({ where: { id: otherTrack.id }, data: { commentCount: 1 } });
    const art = await createAsset(victim, { kind: "IMAGE", status: "ATTACHED" });
    const victimName = usernameOf(victim);

    await assert.rejects(callerFor(victim).account.deleteAccount({ confirmUsername: "wrong" }), { code: "BAD_REQUEST" });
    await callerFor(victim).account.deleteAccount({ confirmUsername: victimName.toUpperCase() });

    // hidden immediately: profile and track pages 404, cannot sign in (no sessions / accounts)
    assert.equal((await callerFor().profiles.byUsername({ username: victimName })).status, "missing");
    assert.equal((await callerFor().tracks.byPermalink({ username: victimName, slug: victimTrack.slug })).status, "missing");

    // the purge ran (after() fallback runs in the background in tests): wait for it
    for (let i = 0; i < 50 && (await db.track.count({ where: { creatorId: victim } })) > 0; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await db.track.count({ where: { creatorId: victim } }), 0);
    const survivorTrack = await db.track.findUniqueOrThrow({ where: { id: otherTrack.id } });
    assert.deepEqual([survivorTrack.likeCount, survivorTrack.commentCount], [0, 0], "counters follow the deleted rows");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: other } })).followerCount, 0);
    assert.equal(await db.mediaAsset.count({ where: { id: art.id } }), 0);
    assert.ok(await db.storageDeletion.findFirst({ where: { key: art.storageKey } }), "its R2 objects are queued for deletion");
    // the row (and username) is held for 30 days
    assert.equal(await db.user.count({ where: { id: victim } }), 1);
    assert.equal((await checkUsername(db, victimName, other)).available, false);
  });

  it("the daily cron finishes interrupted purges and releases the account after 30 days", async () => {
    const user = await createUser("held");
    const track = await createTrack(user, { title: "left behind" });
    await markAccountDeleted(db, user);
    const first = await purgeDeletedAccounts(db);
    assert.ok(first.purged >= 1);
    assert.equal(await db.track.count({ where: { id: track.id } }), 0);
    assert.equal(await db.user.count({ where: { id: user } }), 1);

    const later = new Date(Date.now() + 31 * 86_400_000);
    const second = await purgeDeletedAccounts(db, later);
    assert.ok(second.removed >= 1);
    assert.equal(await db.user.count({ where: { id: user } }), 0);
  });

  it("purgeAccountContent refuses to run for an active account", async () => {
    const user = await createUser("active-purge");
    await assert.rejects(purgeAccountContent(db, user), /only runs for deleted accounts/);
  });
});

describe("who to follow (FO-4)", () => {
  it("ranks creators followed by people you follow first, and excludes self, followed and blocked", async () => {
    const me = await createUser("sug-me");
    const friend = await createUser("sug-friend");
    const hop = await createUser("sug-hop");
    const popular = await createUser("sug-popular");
    const followed = await createUser("sug-followed");
    const blocked = await createUser("sug-blocked");
    for (const id of [hop, popular, followed, blocked, me]) await createTrack(id, { title: "t" });
    await db.user.updateMany({ where: { id: { in: [hop, popular, followed, blocked, me] } }, data: { publicTrackCount: 1 } });
    await db.user.update({ where: { id: popular }, data: { followerCount: 50 } });
    await db.follow.createMany({ data: [{ followerId: me, followingId: friend }, { followerId: me, followingId: followed }, { followerId: friend, followingId: hop }] });
    await db.block.create({ data: { blockerId: me, blockedId: blocked } });

    const result = await whoToFollow(db, me, { limit: 50 });
    const ids = result.map((u) => u.id);
    assert.ok(!ids.includes(me) && !ids.includes(followed) && !ids.includes(blocked));
    assert.ok(ids.indexOf(hop) < ids.indexOf(popular), "2-hop outranks plain popularity");
    assert.equal(result.find((u) => u.id === hop)?.topTrack?.title, "t");
  });

  it("uses chosen genres to seed suggestions", async () => {
    const [me, jazz, rock] = await Promise.all([createUser("gen-me"), createUser("gen-jazz"), createUser("gen-rock")]);
    await createTrack(jazz, { title: "j", genre: "jazz-blues" });
    await createTrack(rock, { title: "r", genre: "rock" });
    await db.user.updateMany({ where: { id: { in: [jazz, rock] } }, data: { publicTrackCount: 1 } });
    const ids = (await whoToFollow(db, me, { genres: ["jazz-blues"], limit: 200 })).map((u) => u.id);
    assert.ok(ids.indexOf(jazz) < ids.indexOf(rock));
  });
});
