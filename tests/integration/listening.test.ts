import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { recordPlayEvent } from "@/server/modules/tracks/plays";

import { callerFor, cleanup, createCollection, createTrack, createUser, db, resetRateLimits } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(resetRateLimits);

describe("recordPlayEvent", () => {
  it("returns the event id; a repeated play answers with the same event", async () => {
    const owner = await createUser("lp-owner");
    const track = await createTrack(owner);
    const input = { trackId: track.id, listenerId: null, clientHash: "lp-a" };
    const first = await recordPlayEvent(db, input);
    const again = await recordPlayEvent(db, input);
    assert.equal(first.counted, true);
    assert.ok(first.eventId);
    assert.deepEqual(again, { counted: false, eventId: first.eventId });
  });
});

describe("tracks.related", () => {
  it("returns public tracks only, never the seed, at most two per creator, same creator first", async () => {
    const [a, b, c] = await Promise.all([createUser("rel-a"), createUser("rel-b"), createUser("rel-c")]);
    const seed = await createTrack(a, { title: "seed", genre: "electronic", tags: ["synth"] });
    const mine = await Promise.all([1, 2, 3].map((n) => createTrack(a, { title: `mine ${n}`, playCount: n })));
    await Promise.all([1, 2, 3].map((n) => createTrack(b, { title: `sim ${n}`, genre: "electronic" })));
    const tagged = await createTrack(c, { title: "tagged", tags: ["synth"] });
    const hidden = await createTrack(c, { title: "hidden", genre: "electronic", visibility: "PRIVATE" });
    await createTrack(c, { title: "other genre", genre: "jazz" });

    const result = await callerFor().tracks.related({ trackId: seed.id, limit: 20 });
    const ids = result.map((t) => t.id);
    assert.ok(!ids.includes(seed.id));
    assert.ok(!ids.includes(hidden.id));
    assert.equal(result.filter((t) => t.userId === a).length, 2, "same creator capped at two");
    assert.equal(result.filter((t) => t.userId === b).length, 2, "other creators capped at two");
    assert.ok(ids.includes(tagged.id));
    assert.ok(ids.includes(mine[2]!.id), "most played of the creator first");
  });

  it("answers empty for a hidden seed", async () => {
    const owner = await createUser("rel-hidden");
    const seed = await createTrack(owner, { visibility: "PRIVATE", genre: "electronic" });
    await createTrack(owner, { genre: "electronic" });
    assert.deepEqual(await callerFor().tracks.related({ trackId: seed.id }), []);
  });
});

describe("playlists", () => {
  it("creates a private playlist with tracks; mine tells which already contain a track", async () => {
    const owner = await createUser("pl-owner");
    const fan = await createUser("pl-fan");
    const t1 = await createTrack(owner, { title: "one" });
    const t2 = await createTrack(owner, { title: "two" });
    const api = callerFor(fan).collections;

    const created = await api.createPlaylist({ title: "Road trip", trackIds: [t1.id] });
    assert.equal(created.visibility, "PRIVATE");
    assert.equal(created.added, 1);
    const other = await api.createPlaylist({ title: "Road trip" });
    assert.notEqual(other.slug, created.slug, "same title gets a free slug");

    await api.addTracks({ id: created.id, trackIds: [t1.id, t2.id] });
    const mine = await api.mine({ trackId: t2.id });
    assert.equal(mine.find((p) => p.id === created.id)?.hasTrack, true);
    assert.equal(mine.find((p) => p.id === other.id)?.hasTrack, false);
    assert.equal((await db.collection.findUniqueOrThrow({ where: { id: created.id } })).trackCount, 2);

    // albums are not offered, and strangers cannot add to someone else's playlist
    await createCollection(fan, { type: "ALBUM" });
    assert.ok((await api.mine()).every((p) => ["Road trip"].includes(p.title)));
    await assert.rejects(callerFor(owner).collections.addTracks({ id: created.id, trackIds: [t1.id] }));
  });
});

describe("play progress", () => {
  it("only ever grows listenedMs", async () => {
    const owner = await createUser("pp-owner");
    const track = await createTrack(owner);
    const { eventId } = await recordPlayEvent(db, { trackId: track.id, listenerId: null, clientHash: "pp" });
    assert.ok(eventId);
    const { POST } = await import("@/app/api/plays/[eventId]/progress/route");
    const send = (body: unknown) =>
      POST(new Request("http://local", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ eventId }) });
    await send({ listenedMs: 20_000, completed: true });
    await send({ listenedMs: 5_000, completed: false });
    const event = await db.playEvent.findUniqueOrThrow({ where: { id: eventId } });
    assert.equal(event.listenedMs, 20_000);
    assert.equal(event.completed, true);
    assert.equal((await send({ nonsense: true })).status, 204);
  });
});
