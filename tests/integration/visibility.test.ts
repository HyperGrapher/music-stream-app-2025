import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { callerFor, cleanup, createAsset, createUser, db } from "./helpers";

after(async () => {
  await cleanup();
  await db.$disconnect();
});

async function trackWith(visibility: "PUBLIC" | "UNLISTED" | "PRIVATE") {
  const owner = await createUser(`vis-${visibility.toLowerCase()}`);
  const asset = await createAsset(owner, { status: "ATTACHED" });
  const track = await db.track.create({
    data: { creatorId: owner, audioAssetId: asset.id, title: visibility, visibility },
  });
  return { owner, trackId: track.id };
}

describe("artist.getTrack visibility", () => {
  it("shows public tracks to anyone", async () => {
    const { trackId } = await trackWith("PUBLIC");
    assert.equal((await callerFor().artist.getTrack({ trackId }))?.id, trackId);
  });

  it("shows unlisted tracks to anyone holding the link", async () => {
    const { trackId } = await trackWith("UNLISTED");
    assert.equal((await callerFor().artist.getTrack({ trackId }))?.id, trackId);
  });

  it("shows private tracks only to the creator", async () => {
    const { owner, trackId } = await trackWith("PRIVATE");
    const stranger = await createUser("stranger");
    assert.equal(await callerFor().artist.getTrack({ trackId }), null);
    assert.equal(await callerFor(stranger).artist.getTrack({ trackId }), null);
    assert.equal((await callerFor(owner).artist.getTrack({ trackId }))?.id, trackId);
  });

  it("keeps private and unlisted tracks out of public listings", async () => {
    const pub = await trackWith("PUBLIC");
    const unlisted = await trackWith("UNLISTED");
    const priv = await trackWith("PRIVATE");
    for (const t of [pub, unlisted, priv]) {
      const tracks = await callerFor().artist.getPopularTracks({ artist: t.owner });
      const ids = tracks.map((x) => x.id);
      assert.equal(ids.includes(t.trackId), t === pub, `listing for ${t.trackId}`);
    }
  });
});
