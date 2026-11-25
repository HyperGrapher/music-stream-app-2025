import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cacheControlFor } from "@/server/modules/visibility";

import { accessParamsFromUrl, accessQuery, isTrackId, trackUrls } from "./access";

describe("helpers", () => {
  it("validates track ids", () => {
    assert.equal(isTrackId("a1da5d4d-67c9-46b4-bd69-df9ccf2ed2a3"), true);
    assert.equal(isTrackId("nope"), false);
    assert.equal(isTrackId(undefined), false);
  });

  it("only lets shared caches keep public content", () => {
    assert.match(cacheControlFor("public", 60), /^public, max-age=60/);
    assert.match(cacheControlFor("secret", 60), /^private/);
    assert.match(cacheControlFor("owner", 60), /^private/);
  });

  it("builds same-origin urls", () => {
    assert.equal(trackUrls("x", { waveformVersion: 3 }).waveformUrl, "/api/tracks/x/waveform?v=3");
    assert.equal(trackUrls("x").streamUrl, "/api/tracks/x/stream");
  });

  it("carries secret-link proof on every media url (VI-1)", () => {
    const urls = trackUrls("x", { access: { secret: "tok", collectionId: "c1" } });
    assert.equal(urls.streamUrl, "/api/tracks/x/stream?c=c1&s=tok");
    assert.equal(urls.waveformUrl, "/api/tracks/x/waveform?v=1&c=c1&s=tok");
    assert.equal(urls.artworkFallbackUrl, "/api/tracks/x/artwork?c=c1&s=tok");
    assert.equal(trackUrls("x", { access: { secret: "tok" } }).streamUrl, "/api/tracks/x/stream?s=tok");
  });

  it("round-trips access params through a url", () => {
    assert.equal(accessQuery({}), "");
    assert.equal(accessQuery({ collectionId: "c1" }), ""); // a collection id alone proves nothing
    assert.deepEqual(accessParamsFromUrl("http://x/api?c=c1&s=tok"), { secret: "tok", collectionId: "c1" });
    assert.deepEqual(accessParamsFromUrl("http://x/api"), { secret: null, collectionId: null });
  });
});
