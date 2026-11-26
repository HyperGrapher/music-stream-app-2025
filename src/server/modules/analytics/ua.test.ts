import assert from "node:assert/strict";
import { it } from "node:test";

import { cleanPath, cleanReferrer, parseUserAgent } from "./ua";

it("reads device, browser and bots", () => {
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36"), { device: "desktop", browser: "Chrome", bot: false });
  assert.equal(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Mobile Safari").device, "mobile");
  assert.equal(parseUserAgent("Mozilla/5.0 (iPad) AppleWebKit Safari").device, "tablet");
  assert.equal(parseUserAgent("Mozilla/5.0 Chrome/120 Edg/120").browser, "Edge");
  assert.equal(parseUserAgent("Googlebot/2.1").bot, true);
  assert.equal(parseUserAgent(null).bot, true);
});

it("stores paths without queries, with secrets masked, and skips internal areas", () => {
  assert.equal(cleanPath("/ana/blue-hour/s-abcdef123?x=1#t=5"), "/ana/blue-hour/s-…");
  assert.equal(cleanPath("/"), "/");
  assert.equal(cleanPath("/admin/users"), null);
  assert.equal(cleanPath("/api/x"), null);
  assert.equal(cleanPath("//evil.test"), null);
  assert.equal(cleanPath("nope"), null);
});

it("keeps only the referring host", () => {
  assert.equal(cleanReferrer("https://www.google.com/search?q=x", "music.test"), "www.google.com");
  assert.equal(cleanReferrer("https://music.test/discover", "music.test"), null);
  assert.equal(cleanReferrer("garbage", "music.test"), null);
});
