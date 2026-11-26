import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createCollection, createTrack, createUser, db } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

const unique = () => `zq${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;

describe("search", () => {
  it("finds by title, artist and tags; tolerates typos; prefix-matches; ranks popular above equal matches", async () => {
    const word = unique();
    const owner = await createUser("srch-a");
    const popular = await createTrack(owner, { title: `${word} popular`, playCount: 500, likeCount: 50 });
    const quiet = await createTrack(owner, { title: `${word} quiet` });
    const tagged = await createTrack(owner, { title: "unrelated name", tags: [word] });
    const api = callerFor().search;

    const exact = (await api.tracks({ q: word })).items.map((t) => t.id);
    assert.deepEqual(exact.slice(0, 2), [popular.id, quiet.id], "popularity breaks ties");
    assert.ok(exact.includes(tagged.id), "tags are searchable");

    const typo = `${word.slice(0, -1)}x popular`;
    assert.ok((await api.tracks({ q: typo })).items.some((t) => t.id === popular.id), "typo tolerance");
    assert.ok((await api.tracks({ q: word.slice(0, 6) })).items.some((t) => t.id === popular.id), "prefix");
  });

  it("never returns hidden content: private, scheduled in the future, removed, or suspended creators", async () => {
    const word = unique();
    const owner = await createUser("srch-b");
    const visible = await createTrack(owner, { title: `${word} visible` });
    const priv = await createTrack(owner, { title: `${word} private`, visibility: "PRIVATE" });
    const scheduled = await createTrack(owner, { title: `${word} later`, visibility: "SCHEDULED", publishAt: new Date(Date.now() + 86_400_000) });
    const removed = await createTrack(owner, { title: `${word} removed`, moderationState: "REMOVED" });
    const ids = (await callerFor().search.tracks({ q: word })).items.map((t) => t.id);
    assert.deepEqual(ids, [visible.id]);
    for (const hidden of [priv, scheduled, removed]) assert.ok(!ids.includes(hidden.id));

    await db.user.update({ where: { id: owner }, data: { status: "SUSPENDED" } });
    assert.deepEqual((await callerFor().search.tracks({ q: word })).items, []);
    await db.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
  });

  it("filters by genre, duration and added window", async () => {
    const word = unique();
    const owner = await createUser("srch-c");
    const short = await createTrack(owner, { title: `${word} short`, genre: "rock", durationMs: 60_000 });
    const long = await createTrack(owner, { title: `${word} long`, genre: "jazz-blues", durationMs: 700_000 });
    const api = callerFor().search;
    assert.deepEqual((await api.tracks({ q: word, genre: "rock" })).items.map((t) => t.id), [short.id]);
    assert.deepEqual((await api.tracks({ q: word, duration: "long" })).items.map((t) => t.id), [long.id]);
    assert.equal((await api.tracks({ q: word, added: "hour" })).items.length, 2);
    await db.track.update({ where: { id: short.id }, data: { publishedAt: new Date(Date.now() - 3 * 86_400_000) } });
    assert.deepEqual((await api.tracks({ q: word, added: "day" })).items.map((t) => t.id), [long.id]);
  });

  it("finds people and collections, and suggest returns the grouped autocomplete", async () => {
    const word = unique();
    const person = await createUser("srch-d");
    await db.user.update({ where: { id: person }, data: { name: `${word} Band`, onboardedAt: new Date() } });
    const track = await createTrack(person, { title: `${word} anthem` });
    await createCollection(person, { title: `${word} LP`, type: "ALBUM", trackIds: [track.id] });
    await createCollection(person, { title: `${word} mix`, type: "PLAYLIST" });
    await createCollection(person, { title: `${word} secret`, type: "PLAYLIST", visibility: "PRIVATE" });
    const api = callerFor().search;

    assert.equal((await api.people({ q: word })).items[0]?.id, person);
    assert.deepEqual((await api.collections({ q: word, kind: "albums" })).items.map((c) => c.title), [`${word} LP`]);
    assert.deepEqual((await api.collections({ q: word, kind: "playlists" })).items.map((c) => c.title), [`${word} mix`]);
    const s = await api.suggest({ q: word });
    assert.equal(s.people.length, 1);
    assert.equal(s.tracks.length, 1);
    assert.equal(s.albums.length, 1);
    assert.equal(s.playlists.length, 1);
    assert.deepEqual(await api.suggest({ q: "a" }), { people: [], tracks: [], albums: [], playlists: [] }, "min 2 chars");
  });

  it("is safe against odd input", async () => {
    const api = callerFor().search;
    for (const q of ["'; DROP TABLE track;--", "%", "_", "\\", "((", "\"unclosed", "a & b | !c"]) {
      const result = await api.tracks({ q });
      assert.ok(Array.isArray(result.items));
    }
  });
});
