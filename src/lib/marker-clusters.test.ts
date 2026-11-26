import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clusterMarkers } from "./marker-clusters";

describe("clusterMarkers", () => {
  it("merges markers closer than 3% of the track and keeps the rest apart", () => {
    const groups = clusterMarkers([{ seconds: 100 }, { seconds: 2 }, { seconds: 4 }, { seconds: 50 }], 200);
    assert.deepEqual(groups.map((g) => g.map((m) => m.seconds)), [[2, 4], [50], [100]]);
  });
  it("never merges when the duration is unknown", () => {
    assert.equal(clusterMarkers([{ seconds: 1 }, { seconds: 2 }], 0).length, 2);
  });
});
