import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cacheControlFor, canAccessTrack, isTrackId, trackUrls } from "./access";

describe("canAccessTrack", () => {
  it("lets anyone with the link open public and unlisted tracks", () => {
    for (const visibility of ["PUBLIC", "UNLISTED"] as const) {
      assert.equal(canAccessTrack({ visibility, creatorId: "a" }, null), true);
      assert.equal(canAccessTrack({ visibility, creatorId: "a" }, "b"), true);
    }
  });

  it("restricts private tracks to the creator", () => {
    const track = { visibility: "PRIVATE" as const, creatorId: "a" };
    assert.equal(canAccessTrack(track, null), false);
    assert.equal(canAccessTrack(track, "b"), false);
    assert.equal(canAccessTrack(track, "a"), true);
  });
});

describe("helpers", () => {
  it("validates track ids", () => {
    assert.equal(isTrackId("a1da5d4d-67c9-46b4-bd69-df9ccf2ed2a3"), true);
    assert.equal(isTrackId("nope"), false);
    assert.equal(isTrackId(undefined), false);
  });

  it("only lets shared caches keep public content", () => {
    assert.match(cacheControlFor("PUBLIC", 60), /^public, max-age=60/);
    assert.equal(cacheControlFor("UNLISTED", 60), "private, no-store");
    assert.equal(cacheControlFor("PRIVATE", 60), "private, no-store");
  });

  it("builds same-origin urls", () => {
    assert.equal(trackUrls("x", 3).waveformUrl, "/api/tracks/x/waveform?v=3");
    assert.equal(trackUrls("x").streamUrl, "/api/tracks/x/stream");
  });
});
