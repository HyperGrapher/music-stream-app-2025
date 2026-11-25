import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createTrack, createUser, db, usernameOf } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

// Titles are unique per run so assertions are unaffected by any other data in the database.
const run = crypto.randomUUID().slice(0, 8);
const title = (name: string) => `${name}-${run}`;

async function makeTrack(
  ownerId: string,
  name: string,
  opts: {
    visibility?: "PUBLIC" | "PRIVATE";
    genre?: string;
    playCount?: number;
    likeCount?: number;
    publishedAt?: Date;
  } = {},
) {
  return createTrack(ownerId, { title: title(name), ...opts });
}

/** The API's order, restricted to the named tracks this test created (other tests' data is ignored). */
const mine = <T extends { title: string }>(tracks: T[], names: string[]) => {
  const wanted = new Set(names.map(title));
  return tracks.filter((t) => wanted.has(t.title)).map((t) => t.title.replace(`-${run}`, ""));
};

const api = () => callerFor();

describe("discover.tracks", () => {
  it("lists public tracks only", async () => {
    const owner = await createUser("disc-vis");
    await makeTrack(owner, "pub");
    await makeTrack(owner, "priv", { visibility: "PRIVATE" });
    await makeTrack(owner, "sched", { visibility: "PRIVATE" });

    const names = mine(await api().discover.tracks({ limit: 48 }), ["pub", "priv", "sched"]);
    assert.deepEqual(names, ["pub"]);
  });

  it("sorts latest by publication time and popular by plays, then likes", async () => {
    const owner = await createUser("disc-sort");
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    await makeTrack(owner, "old-but-hot", { playCount: 50, publishedAt: new Date(now - 3 * day) });
    await makeTrack(owner, "newest", { playCount: 1, publishedAt: new Date(now - 1 * day) });
    await makeTrack(owner, "middle-liked", { playCount: 10, likeCount: 9, publishedAt: new Date(now - 2 * day) });
    await makeTrack(owner, "middle-plain", { playCount: 10, likeCount: 1, publishedAt: new Date(now - 2 * day + 1000) });

    const all = ["old-but-hot", "newest", "middle-liked", "middle-plain"];
    assert.deepEqual(
      mine(await api().discover.tracks({ sort: "latest", limit: 48 }), all),
      ["newest", "middle-plain", "middle-liked", "old-but-hot"],
    );
    assert.deepEqual(
      mine(await api().discover.tracks({ sort: "popular", limit: 48 }), all),
      ["old-but-hot", "middle-liked", "middle-plain", "newest"],
    );
  });

  it("filters by genre", async () => {
    const owner = await createUser("disc-genre");
    await makeTrack(owner, "jazzy", { genre: "jazz-blues" });
    await makeTrack(owner, "rocky", { genre: "rock" });

    assert.deepEqual(mine(await api().discover.tracks({ genre: "jazz-blues", limit: 48 }), ["jazzy", "rocky"]), ["jazzy"]);
  });

  it("searches titles, creator names and usernames case-insensitively, never leaking private tracks", async () => {
    const owner = await createUser(`finder${run}`);
    await makeTrack(owner, "Sunrise");
    await makeTrack(owner, "Hidden", { visibility: "PRIVATE" });
    const needle = `FiNdEr${run}`;

    // by creator name (createUser names users `it-<label>`)
    assert.deepEqual(mine(await api().discover.tracks({ q: needle, limit: 48 }), ["Sunrise", "Hidden"]), ["Sunrise"]);
    // by username
    assert.deepEqual(mine(await api().discover.tracks({ q: usernameOf(owner).toUpperCase(), limit: 48 }), ["Sunrise", "Hidden"]), ["Sunrise"]);
    // by title
    assert.deepEqual(mine(await api().discover.tracks({ q: `SUNRISE-${run}`, limit: 48 }), ["Sunrise", "Hidden"]), ["Sunrise"]);
    // private titles are not searchable
    assert.deepEqual(mine(await api().discover.tracks({ q: `hidden-${run}`, limit: 48 }), ["Sunrise", "Hidden"]), []);
  });

  it("respects the limit and rejects out-of-range values", async () => {
    const owner = await createUser("disc-limit");
    await makeTrack(owner, "a");
    await makeTrack(owner, "b");
    await makeTrack(owner, "c");
    assert.equal((await api().discover.tracks({ limit: 2 })).length, 2);
    await assert.rejects(api().discover.tracks({ limit: 49 }));
    await assert.rejects(api().discover.tracks({ limit: 0 }));
  });

  it("returns the card DTO (creator, permalink, media urls, waveform)", async () => {
    const owner = await createUser("disc-dto");
    const track = await makeTrack(owner, "dto", { genre: "folk-singer-songwriter" });
    const [item] = await api().discover.tracks({ q: title("dto"), limit: 5 });
    assert.equal(item?.id, track.id);
    assert.equal(item?.userId, owner);
    assert.equal(item?.user?.name, "it-disc-dto");
    assert.equal(item?.user?.username, usernameOf(owner));
    assert.equal(item?.permalink, `/${usernameOf(owner)}/${track.slug}`);
    assert.equal(item?.duration, 30);
    assert.equal(item?.streamUrl, `/api/tracks/${track.id}/stream`);
    assert.equal(item?.artworkUrl, null);
    assert.equal(item?.waveformUrl, `/api/tracks/${track.id}/waveform?v=1`);
    assert.equal(item?.artworkSrcSet, null);
  });

  it("serves processed artwork as a srcset of its renditions, legacy artwork as one url", async () => {
    const owner = await createUser("disc-art");
    const assetId = crypto.randomUUID();
    await db.mediaAsset.create({
      data: {
        id: assetId,
        ownerId: owner,
        kind: "IMAGE",
        imagePurpose: "ARTWORK",
        status: "ATTACHED",
        bucket: "test-bucket",
        storageKey: `artworks/${owner}/${assetId}/640.webp`,
        imageWidths: [96, 320, 640],
        originalFilename: "cover.jpg",
        mimeType: "image/webp",
      },
    });
    const legacyArt = await createAsset(owner, { kind: "IMAGE", status: "ATTACHED" });
    const processed = await createTrack(owner, { title: title("art-new"), artworkAssetId: assetId });
    const legacy = await createTrack(owner, { title: title("art-old"), artworkAssetId: legacyArt.id });

    const items = [
      ...(await api().discover.tracks({ q: title("art-new"), limit: 5 })),
      ...(await api().discover.tracks({ q: title("art-old"), limit: 5 })),
    ];
    const route = (id: string) => `/api/tracks/${id}/artwork`;
    const byId = new Map(items.map((i) => [i.id, i]));
    assert.equal(byId.get(processed.id)?.artworkUrl, `${route(processed.id)}?w=640`);
    assert.equal(
      byId.get(processed.id)?.artworkSrcSet,
      `${route(processed.id)}?w=96 96w, ${route(processed.id)}?w=320 320w, ${route(processed.id)}?w=640 640w`,
    );
    assert.equal(byId.get(legacy.id)?.artworkUrl, route(legacy.id));
    assert.equal(byId.get(legacy.id)?.artworkSrcSet, null);

    // the track page uses the same mapping
    const page = await api().tracks.byPermalink({ username: usernameOf(owner), slug: processed.slug });
    assert.equal(page.status === "ok" && page.track.artworkSrcSet, byId.get(processed.id)?.artworkSrcSet);
  });
});

describe("discover.genres", () => {
  it("counts public tracks per genre and ignores private ones", async () => {
    const owner = await createUser("disc-genres");
    const genre = `g${run}`;
    await makeTrack(owner, "one", { genre });
    await makeTrack(owner, "two", { genre });
    await makeTrack(owner, "secret", { genre, visibility: "PRIVATE" });
    const onlyPrivate = `p${run}`;
    await makeTrack(owner, "hidden", { genre: onlyPrivate, visibility: "PRIVATE" });

    const genres = await api().discover.genres();
    assert.equal(genres.find((g) => g.genre === genre)?.count, 2);
    assert.equal(genres.find((g) => g.genre === onlyPrivate), undefined);
  });
});
