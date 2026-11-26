import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { recordPlay } from "@/server/modules/tracks/plays";

import { callerFor, cleanup, createCollection, createTrack, createUser, db, resetRateLimits, usernameOf } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const notifications = (recipientId: string) => db.notification.findMany({ where: { recipientId }, orderBy: { createdAt: "asc" } });

describe("collection and comment likes", () => {
  it("collection likes are idempotent, move the counter with rows, notify once, and are undone cleanly", async () => {
    const owner = await createUser("cl-owner");
    const fan = await createUser("cl-fan");
    const collection = await createCollection(owner, { title: "Likeable" });
    const api = callerFor(fan).engagement;

    assert.deepEqual(await api.setCollectionLike({ collectionId: collection.id, liked: true }), { liked: true, likeCount: 1 });
    await api.setCollectionLike({ collectionId: collection.id, liked: true });
    assert.equal((await notifications(owner)).filter((n) => n.type === "COLLECTION_LIKE").length, 1);
    assert.equal(await db.collectionLike.count({ where: { collectionId: collection.id } }), 1);

    assert.deepEqual(await api.setCollectionLike({ collectionId: collection.id, liked: false }), { liked: false, likeCount: 0 });
    assert.equal((await notifications(owner)).length, 0, "the unread notification goes with the like (NT-4)");
    await assert.rejects(callerFor(owner).engagement.setCollectionLike({ collectionId: collection.id, liked: true }), /own/);
  });

  it("private collections cannot be liked, and hide from strangers", async () => {
    const owner = await createUser("cl-priv-owner");
    const fan = await createUser("cl-priv-fan");
    const collection = await createCollection(owner, { visibility: "PRIVATE" });
    await assert.rejects(callerFor(fan).engagement.setCollectionLike({ collectionId: collection.id, liked: true }), /not found/i);
  });

  it("comment likes count rows and notify the author", async () => {
    const owner = await createUser("cm-owner");
    const author = await createUser("cm-author");
    const fan = await createUser("cm-fan");
    const track = await createTrack(owner);
    const comment = await db.comment.create({ data: { trackId: track.id, authorId: author, content: "nice" } });
    const api = callerFor(fan).engagement;

    assert.equal((await api.setCommentLike({ commentId: comment.id, liked: true })).likeCount, 1);
    assert.equal((await api.setCommentLike({ commentId: comment.id, liked: true })).likeCount, 1);
    assert.equal((await notifications(author)).filter((n) => n.type === "COMMENT_LIKE").length, 1);
    assert.equal((await api.setCommentLike({ commentId: comment.id, liked: false })).likeCount, 0);
    assert.equal(await db.commentLike.count({ where: { commentId: comment.id } }), 0);
  });
});

describe("reposts, feed and J6", () => {
  it("repost creates activity + notification and shows in the follower's feed; un-repost removes all of it", async () => {
    const creator = await createUser("rp-creator");
    const reposter = await createUser("rp-reposter");
    const follower = await createUser("rp-follower");
    const track = await createTrack(creator, { title: "Reposted track" });
    await callerFor(follower).engagement.setFollow({ userId: reposter, follow: true });

    const res = await callerFor(reposter).engagement.setTrackRepost({ trackId: track.id, reposted: true });
    assert.deepEqual(res, { reposted: true, repostCount: 1 });
    await callerFor(reposter).engagement.setTrackRepost({ trackId: track.id, reposted: true });
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).repostCount, 1);
    assert.equal(await db.activity.count({ where: { actorId: reposter, type: "TRACK_REPOSTED", trackId: track.id } }), 1);
    assert.equal((await notifications(creator)).filter((n) => n.type === "TRACK_REPOST").length, 1);

    const feed = await callerFor(follower).feed.list({});
    const item = feed.items.find((i) => i.track?.id === track.id);
    assert.equal(item?.verb, "reposted");
    assert.equal(item?.actors[0]?.id, reposter);

    await callerFor(reposter).engagement.setTrackRepost({ trackId: track.id, reposted: false });
    assert.equal((await callerFor(follower).feed.list({})).items.some((i) => i.track?.id === track.id && i.verb === "reposted"), false);
    assert.equal((await notifications(creator)).filter((n) => n.type === "TRACK_REPOST").length, 0);
    assert.equal((await db.track.findUniqueOrThrow({ where: { id: track.id } })).repostCount, 0);
  });

  it("several reposters of one track collapse into one feed item; own and private tracks cannot be reposted", async () => {
    const creator = await createUser("fd-creator");
    const [a, b, viewer] = await Promise.all([createUser("fd-a"), createUser("fd-b"), createUser("fd-viewer")]);
    const track = await createTrack(creator);
    const priv = await createTrack(creator, { visibility: "PRIVATE" });
    for (const reposter of [a, b]) {
      await callerFor(viewer).engagement.setFollow({ userId: reposter, follow: true });
      await callerFor(reposter).engagement.setTrackRepost({ trackId: track.id, reposted: true });
    }
    const items = (await callerFor(viewer).feed.list({})).items.filter((i) => i.track?.id === track.id);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.actorCount, 2);
    await assert.rejects(callerFor(creator).engagement.setTrackRepost({ trackId: track.id, reposted: true }), /own/);
    await assert.rejects(callerFor(a).engagement.setTrackRepost({ trackId: priv.id, reposted: true }));
  });

  it("the feed only shows people you follow, public items, and not blocked users", async () => {
    const creator = await createUser("fd2-creator");
    const viewer = await createUser("fd2-viewer");
    const track = await createTrack(creator, { title: "Feed track" });
    await db.activity.create({ data: { actorId: creator, type: "TRACK_POSTED", trackId: track.id } });
    assert.equal((await callerFor(viewer).feed.list({})).items.length, 0);
    await callerFor(viewer).engagement.setFollow({ userId: creator, follow: true });
    assert.ok((await callerFor(viewer).feed.list({})).items.some((i) => i.track?.id === track.id && i.verb === "posted"));
    await db.track.update({ where: { id: track.id }, data: { visibility: "PRIVATE" } });
    assert.equal((await callerFor(viewer).feed.list({})).items.some((i) => i.track?.id === track.id), false);
    await db.track.update({ where: { id: track.id }, data: { visibility: "PUBLIC" } });
    await db.block.create({ data: { blockerId: viewer, blockedId: creator } });
    assert.equal((await callerFor(viewer).feed.list({})).items.length, 0);
  });
});

describe("notifications", () => {
  it("group at read time, count unread once per group, and mark read", async () => {
    const creator = await createUser("nt-creator");
    const fans = await Promise.all([1, 2, 3, 4].map((n) => createUser(`nt-fan${n}`)));
    const track = await createTrack(creator, { title: "Blue Hour" });
    for (const fan of fans) await callerFor(fan).engagement.setTrackLike({ trackId: track.id, liked: true });
    const api = callerFor(creator).notifications;
    assert.equal(await api.unreadCount(), 1);
    const { items } = await api.list({});
    const likes = items.filter((i) => i.type === "TRACK_LIKE");
    assert.equal(likes.length, 1);
    assert.equal(likes[0]?.actorCount, 4);
    assert.equal(likes[0]?.actors.length, 3);
    assert.equal(likes[0]?.target?.title, "Blue Hour");
    assert.equal((await api.list({ filter: "comments" })).items.length, 0);
    await api.markRead({});
    assert.equal(await api.unreadCount(), 0);
  });

  it("never notifies yourself, blocked users, or users who turned the type off; replies and mentions notify", async () => {
    const creator = await createUser("nt2-creator");
    const fan = await createUser("nt2-fan");
    const third = await createUser("nt2-third");
    const track = await createTrack(creator);
    await db.user.updateMany({ where: { id: { in: [creator, fan, third] } }, data: { emailVerified: true } });

    await db.block.create({ data: { blockerId: creator, blockedId: fan } });
    await callerFor(fan).engagement.setTrackLike({ trackId: track.id, liked: true }).catch(() => undefined);
    assert.equal((await notifications(creator)).length, 0, "blocked actor");
    await db.block.deleteMany({});

    await db.notificationPreference.create({ data: { userId: creator, type: "COMMENT", inApp: false } });
    const parent = await callerFor(fan).comments.create({ trackId: track.id, content: "first" });
    assert.equal((await notifications(creator)).filter((n) => n.type === "COMMENT").length, 0, "type turned off");

    await callerFor(third).comments.create({ trackId: track.id, content: `thanks @${usernameOf(fan)}!`, parentId: parent.id });
    const types = (await notifications(fan)).map((n) => n.type).sort();
    assert.deepEqual(types, ["REPLY"], "replied-to author is told once even when also mentioned");
    await callerFor(third).comments.create({ trackId: track.id, content: `hey @${usernameOf(fan)}` });
    assert.ok((await notifications(fan)).some((n) => n.type === "MENTION"));
    await callerFor(creator).comments.create({ trackId: track.id, content: "my own" });
    assert.equal((await notifications(creator)).filter((n) => n.actorId === creator).length, 0);
  });
});

describe("library", () => {
  it("lists created and liked playlists, and a history that Clear listening history hides", async () => {
    const owner = await createUser("lib-owner");
    const me = await createUser("lib-me");
    const track = await createTrack(owner, { title: "Heard it" });
    const theirs = await createCollection(owner, { type: "PLAYLIST", title: "Theirs" });
    const mine = await callerFor(me).collections.createPlaylist({ title: "Mine" });
    await callerFor(me).engagement.setCollectionLike({ collectionId: theirs.id, liked: true });
    const api = callerFor(me).library;

    const all = await api.collections({ kind: "playlists" });
    assert.deepEqual(all.items.map((c) => [c.title, c.origin]).sort(), [["Mine", "created"], ["Theirs", "liked"]]);
    assert.deepEqual((await api.collections({ kind: "playlists", filter: "created" })).items.map((c) => c.id), [mine.id]);
    assert.equal((await api.collections({ kind: "albums" })).items.length, 0);

    await recordPlay(db, { trackId: track.id, listenerId: me, clientHash: "x" });
    assert.deepEqual((await api.history()).map((h) => h.track.id), [track.id]);
    await api.clearHistory();
    assert.equal((await api.history()).length, 0);
    assert.equal(await db.playEvent.count({ where: { trackId: track.id } }), 1, "events are kept for counts");
  });
});
