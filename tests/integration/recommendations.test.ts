import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { clearTasteCache } from "@/server/modules/recommendations";

import { callerFor, cleanup, createTrack, createUser, db, resetRateLimits } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});
beforeEach(async () => {
  clearTasteCache();
  await resetRateLimits();
});

const genreOf = () => `g${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;

describe("discover.forYou (recommendations)", () => {
  it("recommends tracks matching liked genres, never what was liked/own/played, capped per creator", async () => {
    const genre = genreOf();
    const other = genreOf();
    const listener = await createUser("rec-listener");
    const artists = await Promise.all([1, 2, 3, 4].map((n) => createUser(`rec-artist${n}`)));
    const liked = await createTrack(artists[0]!, { title: "liked one", genre });
    await db.trackLike.create({ data: { userId: listener, trackId: liked.id } });
    const match1 = await createTrack(artists[1]!, { title: "match 1", genre, playCount: 50 });
    const match2 = await createTrack(artists[1]!, { title: "match 2", genre, playCount: 40 });
    const match3 = await createTrack(artists[1]!, { title: "match 3 (third of one creator)", genre, playCount: 30 });
    const match4 = await createTrack(artists[2]!, { title: "match 4", genre });
    const offTaste = await createTrack(artists[3]!, { title: "other genre", genre: other, playCount: 999 });
    const hidden = await createTrack(artists[3]!, { title: "hidden", genre, visibility: "PRIVATE" });
    const own = await createTrack(listener, { title: "mine", genre });
    const played = await createTrack(artists[2]!, { title: "just played", genre });
    await db.playEvent.create({ data: { trackId: played.id, listenerId: listener, clientHash: null } });

    const ids = (await callerFor(listener).discover.forYou({ limit: 12 })).map((t) => t.id);
    for (const wanted of [match1, match2, match4]) assert.ok(ids.includes(wanted.id), wanted.id);
    for (const unwanted of [liked, offTaste, hidden, own, played]) assert.ok(!ids.includes(unwanted.id), `should not include ${unwanted.id}`);
    assert.ok(!ids.includes(match3.id), "at most two per creator");
  });

  it("uses co-likes: tracks liked by people who liked the same track", async () => {
    const listener = await createUser("co-listener");
    const peer = await createUser("co-peer");
    const artist = await createUser("co-artist");
    const shared = await createTrack(artist, { title: "shared taste", genre: genreOf() });
    const discovery = await createTrack(artist, { title: "peer also liked", genre: genreOf() });
    for (const user of [listener, peer]) await db.trackLike.create({ data: { userId: user, trackId: shared.id } });
    await db.trackLike.create({ data: { userId: peer, trackId: discovery.id } });
    const ids = (await callerFor(listener).discover.forYou()).map((t) => t.id);
    assert.ok(ids.includes(discovery.id));
  });

  it("cold start falls back to trending in the favourite genres; anonymous gets trending", async () => {
    const genre = genreOf();
    const listener = await createUser("cold-listener");
    await db.user.update({ where: { id: listener }, data: { favoriteGenres: [genre] } });
    const artist = await createUser("cold-artist");
    const fav = await createTrack(artist, { title: "fav genre", genre, playCount: 5 });
    const ids = (await callerFor(listener).discover.forYou()).map((t) => t.id);
    assert.ok(ids.includes(fav.id));
    assert.ok(Array.isArray(await callerFor().discover.forYou()));
  });

  it("trending can be limited to a genre and ignores unpublished or old tracks", async () => {
    const genre = genreOf();
    const artist = await createUser("tr-artist");
    const fresh = await createTrack(artist, { genre, playCount: 10 });
    const old = await createTrack(artist, { genre, playCount: 100, publishedAt: new Date(Date.now() - 90 * 86_400_000) });
    const draft = await createTrack(artist, { genre, visibility: "PRIVATE" });
    const ids = (await callerFor().discover.trending({ genre })).map((t) => t.id);
    assert.deepEqual(ids, [fresh.id]);
    assert.ok(!ids.includes(old.id) && !ids.includes(draft.id));
  });
});

describe("tracks.related (RC-3)", () => {
  it("puts same genre and shared tags first among the other creators' tracks", async () => {
    const genre = genreOf();
    const seedOwner = await createUser("rel-seed");
    const a = await createUser("rel-a2");
    const b = await createUser("rel-b2");
    const seed = await createTrack(seedOwner, { genre, tags: ["x", "y"] });
    const weak = await createTrack(a, { title: "genre only", genre, playCount: 100 });
    const strong = await createTrack(b, { title: "genre and tags", genre, tags: ["x", "y"] });
    const ids = (await callerFor().tracks.related({ trackId: seed.id })).map((t) => t.id);
    assert.ok(ids.indexOf(strong.id) < ids.indexOf(weak.id));
  });
});
