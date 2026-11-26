import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { callerFor, cleanup, createTrack, createUser, db, resetRateLimits, usernameOf, withAppCode } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

const HOST = "http://localhost:3000";
const everyone = (...ids: string[]) => db.user.updateMany({ where: { id: { in: ids } }, data: { messagePolicy: "EVERYONE" } });
const send = (from: string, to: string, body: string) => callerFor(from).messages.send({ toUserId: to, body });

describe("direct messages (MS-1..MS-6)", () => {
  it("starts one conversation per pair, lists it, counts unread and marks read", async () => {
    const [a, b] = [await createUser("dm-a"), await createUser("dm-b")];
    await everyone(a, b);
    const first = await send(a, b, "  hello there  ");
    const reply = await send(b, a, "hi!");
    const again = await callerFor(a).messages.send({ conversationId: first.conversationId, body: "how are you" });
    assert.equal(reply.conversationId, first.conversationId);
    assert.equal(again.conversationId, first.conversationId);
    assert.equal(await db.conversation.count({ where: { members: { some: { userId: a } } } }), 1);

    const list = await callerFor(b).messages.conversations();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.other.id, a);
    assert.equal(list[0]!.unread, 1); // b's reply read "hello there"; only "how are you" came after it
    assert.equal(list[0]!.last.body, "how are you");
    assert.equal(await callerFor(b).messages.unreadCount(), 1);

    const thread = await callerFor(b).messages.thread({ conversationId: first.conversationId });
    assert.deepEqual(thread.messages.map((m) => [m.body, m.mine]), [["hello there", false], ["hi!", true], ["how are you", false]]);
    assert.equal(thread.canSend, true);

    await callerFor(b).messages.markRead({ conversationId: first.conversationId });
    assert.equal(await callerFor(b).messages.unreadCount(), 0);
    assert.equal((await callerFor(a).messages.conversations())[0]!.unread, 0); // a wrote last, so a has seen everything
  });

  it("validates the text, needs a verified email, and is rate limited", async () => {
    const [a, b] = [await createUser("dm-v-a"), await createUser("dm-v-b")];
    const unverified = await createUser("dm-v-u", { emailVerified: false });
    await everyone(a, b, unverified);
    await assert.rejects(send(a, b, "   "), /Write a message/);
    await assert.rejects(send(a, b, "x".repeat(2001)), /at most 2000/);
    await send(a, b, "x".repeat(2000));
    await assert.rejects(send(unverified, b, "hi"), withAppCode("EMAIL_NOT_VERIFIED"));
    await assert.rejects(send(a, a, "me"), /yourself/);
    await db.rateLimitBucket.deleteMany();
    for (let i = 0; i < 30; i++) await send(a, b, `m${i}`);
    await assert.rejects(send(a, b, "one too many"), withAppCode("RATE_LIMITED"));
  });

  it("new accounts open at most 10 new conversations a day; replies in old ones are free", async () => {
    const young = await createUser("dm-young");
    const others = await Promise.all(Array.from({ length: 11 }, (_, i) => createUser(`dm-peer-${i}`)));
    await everyone(young, ...others);
    for (const peer of others.slice(0, 10)) await send(young, peer, "hi");
    await assert.rejects(send(young, others[10]!, "hi"), withAppCode("RATE_LIMITED"));
    await send(young, others[0]!, "again"); // existing conversation: not a new one
    // an older account is not limited
    await db.user.update({ where: { id: young }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    await db.rateLimitBucket.deleteMany();
    await send(young, others[10]!, "hi");
  });

  it("who can message me: People I follow (default), Everyone, No one; replying is always allowed; blocks refuse", async () => {
    const [sender, target] = [await createUser("pol-s"), await createUser("pol-t")];
    // default is FOLLOWING: the target does not follow the sender
    await assert.rejects(send(sender, target, "hi"), /doesn't accept messages/);
    await callerFor(target).engagement.setFollow({ userId: sender, follow: true });
    await send(sender, target, "now it works");

    await db.user.update({ where: { id: target }, data: { messagePolicy: "NOBODY" } });
    const stranger = await createUser("pol-x");
    await assert.rejects(send(stranger, target, "hi"), /doesn't accept messages/);
    await send(sender, target, "an existing conversation is still refused for the sender? no: target wrote nothing yet").then(
      () => assert.fail("a NOBODY recipient must not receive new messages"),
      () => undefined,
    );
    // the target writes first (their own choice), the sender may reply even though the target takes no messages
    await everyone(sender);
    await send(target, sender, "hello from me");
    await send(sender, target, "reply is fine");

    await callerFor(sender).trust.setBlock({ userId: target, blocked: true });
    await assert.rejects(send(target, sender, "blocked"), withAppCode("BLOCKED"));
    await assert.rejects(send(sender, target, "blocked"), withAppCode("BLOCKED"));
  });

  it("deleting hides it for me only; a new message brings the conversation back without the old ones", async () => {
    const [a, b] = [await createUser("del-a"), await createUser("del-b")];
    await everyone(a, b);
    const { conversationId } = await send(a, b, "old 1");
    await send(b, a, "old 2");
    await callerFor(a).messages.hide({ conversationId });
    assert.equal((await callerFor(a).messages.conversations()).length, 0);
    assert.equal((await callerFor(b).messages.conversations()).length, 1);
    assert.equal((await callerFor(a).messages.thread({ conversationId })).messages.length, 0);
    await new Promise((r) => setTimeout(r, 15));
    await send(b, a, "new one");
    const list = await callerFor(a).messages.conversations();
    assert.equal(list.length, 1);
    assert.deepEqual((await callerFor(a).messages.thread({ conversationId })).messages.map((m) => m.body), ["new one"]);
    assert.equal((await callerFor(b).messages.thread({ conversationId })).messages.length, 3);
  });

  it("only members read a thread; blocking hides the conversation from the blocker", async () => {
    const [a, b, outsider] = [await createUser("pri-a"), await createUser("pri-b"), await createUser("pri-o")];
    await everyone(a, b);
    const { conversationId } = await send(a, b, "secret");
    await assert.rejects(callerFor(outsider).messages.thread({ conversationId }), /not found/);
    await assert.rejects(callerFor(outsider).messages.markRead({ conversationId }), /not found/);
    await assert.rejects(callerFor(outsider).messages.hide({ conversationId }), /not found/);
    await assert.rejects(callerFor(outsider).messages.send({ conversationId, body: "intruding" }), /not found/);
    await assert.rejects(callerFor().messages.conversations(), /UNAUTHORIZED/);

    await callerFor(b).trust.setBlock({ userId: a, blocked: true });
    assert.equal((await callerFor(b).messages.conversations()).length, 0);
    assert.equal(await callerFor(b).messages.unreadCount(), 0);
    await assert.rejects(callerFor(b).messages.thread({ conversationId }), /not found/);
    // the blocked side still sees what was said but cannot write
    const view = await callerFor(a).messages.thread({ conversationId });
    assert.equal(view.canSend, false);
    assert.equal(view.cannotSendReason, "BLOCKED");
  });

  it("turns links to tracks into cards for people who may see them, and never leaks the secret token", async () => {
    const [a, b] = [await createUser("card-a"), await createUser("card-b")];
    await everyone(a, b);
    const pub = await createTrack(a, { title: "Public One", slug: "public-one" });
    const hidden = await createTrack(a, { title: "Hidden One", slug: "hidden-one", visibility: "PRIVATE" });
    const ua = usernameOf(a);
    const body = `listen ${HOST}/${ua}/${pub.slug} and ${HOST}/${ua}/${hidden.slug} and https://elsewhere.test/${ua}/${pub.slug}`;
    const { conversationId } = await send(a, b, body);
    const thread = await callerFor(b).messages.thread({ conversationId });
    const cards = thread.messages[0]!.cards;
    assert.deepEqual(cards.map((c) => (c.kind === "track" ? c.track.title : "set")), ["Public One"], "the private track has no card without its secret link");
    assert.ok(!JSON.stringify(thread).includes(pub.secretToken), "the secret token of a public track stays on the server");

    await send(a, b, `with the secret: ${HOST}/${ua}/${hidden.slug}/s-${hidden.secretToken}`);
    const next = await callerFor(b).messages.thread({ conversationId });
    const secretCard = next.messages[1]!.cards[0];
    assert.equal(secretCard?.kind === "track" && secretCard.track.title, "Hidden One");
    assert.equal(secretCard?.kind === "track" && secretCard.track.permalink, `/${ua}/${hidden.slug}/s-${hidden.secretToken}`);
    // the wrong secret gives nothing
    await send(a, b, `${HOST}/${ua}/${hidden.slug}/s-wrong`);
    assert.equal((await callerFor(b).messages.thread({ conversationId })).messages[2]!.cards.length, 0);
  });

  it("recipient lookup says who you are writing to and why you cannot", async () => {
    const [a, b] = [await createUser("rc-a"), await createUser("rc-b")];
    const closed = await callerFor(a).messages.recipient({ username: usernameOf(b) });
    assert.deepEqual([closed.canMessage, closed.reason, closed.conversationId], [false, "POLICY", null]);
    await everyone(b);
    const { conversationId } = await send(a, b, "hi");
    const open = await callerFor(a).messages.recipient({ username: usernameOf(b).toUpperCase() });
    assert.deepEqual([open.canMessage, open.conversationId, open.person.id], [true, conversationId, b]);
    await assert.rejects(callerFor(a).messages.recipient({ username: "nobody-here-123" }), /not found/);
  });

  it("reports and moderation of a message (MS-6, TS-1)", async () => {
    const [a, b, outsider] = [await createUser("rep-a"), await createUser("rep-b"), await createUser("rep-o")];
    const admin = await createUser("rep-admin", { role: "ADMIN" });
    await everyone(a, b);
    const { conversationId, messageId } = await send(a, b, "you are awful");
    await assert.rejects(callerFor(outsider).trust.report({ targetType: "MESSAGE", targetId: messageId, reason: "HARASSMENT" }), /could not be found/);
    await assert.rejects(callerFor(a).trust.report({ targetType: "MESSAGE", targetId: messageId, reason: "HARASSMENT" }), /your own/);
    await callerFor(b).trust.report({ targetType: "MESSAGE", targetId: messageId, reason: "HARASSMENT", details: "abuse" });

    const queue = await callerFor(admin).admin.reports({ status: "OPEN", targetType: "MESSAGE" });
    assert.equal(queue.items.length, 1);
    assert.equal(queue.items[0]!.preview?.text, "you are awful");
    await callerFor(admin).admin.remove({ targetType: "MESSAGE", targetId: messageId, reason: "Harassment" });
    const removed = (await callerFor(b).messages.thread({ conversationId })).messages[0]!;
    assert.deepEqual([removed.removed, removed.body], [true, ""]);
    assert.equal((await callerFor(b).messages.conversations())[0]!.last.body, "Message removed");
    assert.equal(await callerFor(b).messages.unreadCount(), 0, "a removed message is not unread");
    assert.ok((await db.notification.findMany({ where: { recipientId: a, type: "SYSTEM" } })).some((n) => n.message?.includes("one of your messages")));
    await callerFor(admin).admin.restore({ targetType: "MESSAGE", targetId: messageId });
    assert.equal((await callerFor(b).messages.thread({ conversationId })).messages[0]!.body, "you are awful");
  });
});
