import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatTimeFragment, parseTimeFragment } from "./time-fragment";

describe("parseTimeFragment", () => {
  it("reads seconds, 1m23s and clock forms", () => {
    assert.equal(parseTimeFragment("#t=83"), 83);
    assert.equal(parseTimeFragment("#t=83s"), 83);
    assert.equal(parseTimeFragment("#t=1m23s"), 83);
    assert.equal(parseTimeFragment("#t=1:23"), 83);
    assert.equal(parseTimeFragment("#t=1:02:03"), 3723);
    assert.equal(parseTimeFragment("#t=1h2m3s"), 3723);
  });
  it("ignores missing and malformed fragments", () => {
    assert.equal(parseTimeFragment(""), null);
    assert.equal(parseTimeFragment("#comments"), null);
    assert.equal(parseTimeFragment("#t="), null);
    assert.equal(parseTimeFragment("#t=abc"), null);
    assert.equal(parseTimeFragment("#t=-5"), null);
  });
  it("round-trips", () => {
    for (const n of [0, 5, 83, 3600, 3723]) assert.equal(parseTimeFragment(`#t=${formatTimeFragment(n)}`), n);
  });
});
