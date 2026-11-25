import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createUser, db } from "./helpers";

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
    visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
    genre?: string;
    playCount?: number;
    likeCount?: number;
    createdAt?: Date;
  } = {},
) {
  const asset = await createAsset(ownerId, { status: "ATTACHED" });
  return db.track.create({
    data: {
      creatorId: ownerId,
      audioAssetId: asset.id,
      title: title(name),
      visibility: opts.visibility ?? "PUBLIC",
      genre: opts.genre,
      playCount: opts.playCount ?? 0,
      likeCount: opts.likeCount ?? 0,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
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
    await makeTrack(owner, "unl", { visibility: "UNLISTED" });
    await makeTrack(owner, "priv", { visibility: "PRIVATE" });

    const names = mine(await api().discover.tracks({ limit: 48 }), ["pub", "unl", "priv"]);
    assert.deepEqual(names, ["pub"]);
  });

  it("sorts latest by creation time and popular by plays, then likes", async () => {
    const owner = await createUser("disc-sort");
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    await makeTrack(owner, "old-but-hot", { playCount: 50, createdAt: new Date(now - 3 * day) });
    await makeTrack(owner, "newest", { playCount: 1, createdAt: new Date(now - 1 * day) });
    await makeTrack(owner, "middle-liked", { playCount: 10, likeCount: 9, createdAt: new Date(now - 2 * day) });
    await makeTrack(owner, "middle-plain", { playCount: 10, likeCount: 1, createdAt: new Date(now - 2 * day + 1000) });

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
    await makeTrack(owner, "jazzy", { genre: "jazz" });
    await makeTrack(owner, "rocky", { genre: "rock" });

    assert.deepEqual(mine(await api().discover.tracks({ genre: "jazz", limit: 48 }), ["jazzy", "rocky"]), ["jazzy"]);
  });

  it("searches titles and creator names case-insensitively, never leaking private tracks", async () => {
    const owner = await createUser(`finder${run}`);
    await makeTrack(owner, "Sunrise");
    await makeTrack(owner, "Hidden", { visibility: "PRIVATE" });
    const needle = `FiNdEr${run}`;

    // by creator name (createUser names users `it-<label>`)
    assert.deepEqual(mine(await api().discover.tracks({ q: needle, limit: 48 }), ["Sunrise", "Hidden"]), ["Sunrise"]);
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

  it("returns the card DTO (creator, artwork fallback, stream-free urls)", async () => {
    const owner = await createUser("disc-dto");
    const track = await makeTrack(owner, "dto", { genre: "folk" });
    const [item] = (await api().discover.tracks({ q: title("dto"), limit: 5 }));
    assert.equal(item?.id, track.id);
    assert.equal(item?.userId, owner);
    assert.match(item?.user.name ?? "", /^it-disc-dto$/);
    assert.equal(item?.artworkUrl, null);
    assert.equal(item?.waveformUrl, `/api/tracks/${track.id}/waveform?v=1`);
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
