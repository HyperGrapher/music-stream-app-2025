import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractUrls, pairKey, parseContentUrl, splitLinks } from "./message-links";

describe("splitLinks", () => {
  it("separates links from text and leaves trailing punctuation as text", () => {
    assert.deepEqual(splitLinks("hear this https://a.io/x/y. wow"), [
      { type: "text", value: "hear this " },
      { type: "link", value: "https://a.io/x/y" },
      { type: "text", value: ". wow" },
    ]);
    assert.deepEqual(splitLinks("no links"), [{ type: "text", value: "no links" }]);
  });
  it("only treats http(s) as links", () => {
    assert.deepEqual(splitLinks("javascript:alert(1) ftp://x"), [{ type: "text", value: "javascript:alert(1) ftp://x" }]);
  });
  it("extracts each distinct url once", () => {
    assert.deepEqual(extractUrls("https://a.io/1 and https://a.io/1 and https://a.io/2"), ["https://a.io/1", "https://a.io/2"]);
  });
});

describe("parseContentUrl", () => {
  const host = "music.test";
  it("recognises tracks and sets, with and without a secret", () => {
    assert.deepEqual(parseContentUrl("https://music.test/Ana/blue-hour", host), { kind: "track", username: "ana", slug: "blue-hour", secret: null });
    assert.deepEqual(parseContentUrl("https://music.test/ana/blue-hour/s-abc123", host), { kind: "track", username: "ana", slug: "blue-hour", secret: "abc123" });
    assert.deepEqual(parseContentUrl("https://music.test/ana/sets/ep-one?x=1", host), { kind: "set", username: "ana", slug: "ep-one", secret: null });
    assert.deepEqual(parseContentUrl("https://music.test/ana/sets/ep-one/s-zz", host), { kind: "set", username: "ana", slug: "ep-one", secret: "zz" });
  });
  it("ignores other hosts, profiles and deeper paths", () => {
    assert.equal(parseContentUrl("https://evil.test/ana/blue-hour", host), null);
    assert.equal(parseContentUrl("https://music.test/ana", host), null);
    assert.equal(parseContentUrl("https://music.test/a/b/c/d/e", host), null);
    assert.equal(parseContentUrl("not a url", host), null);
  });
});

it("pairKey does not depend on the order", () => {
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
});
