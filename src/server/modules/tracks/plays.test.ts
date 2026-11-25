import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientIpFromHeaders, computeClientHash } from "./plays";

describe("computeClientHash", () => {
  it("is deterministic and does not contain the inputs", () => {
    const a = computeClientHash("203.0.113.9", "Mozilla/5.0", "secret");
    assert.equal(a, computeClientHash("203.0.113.9", "Mozilla/5.0", "secret"));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.ok(!a.includes("203"));
  });

  it("differs by ip, user agent and secret", () => {
    const base = computeClientHash("203.0.113.9", "UA", "secret");
    assert.notEqual(base, computeClientHash("203.0.113.10", "UA", "secret"));
    assert.notEqual(base, computeClientHash("203.0.113.9", "UA2", "secret"));
    assert.notEqual(base, computeClientHash("203.0.113.9", "UA", "other"));
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" });
    assert.equal(clientIpFromHeaders(h), "198.51.100.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.1" })), "192.0.2.1");
    assert.equal(clientIpFromHeaders(new Headers()), "unknown");
  });
});
