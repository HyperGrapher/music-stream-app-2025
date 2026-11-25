import assert from "node:assert/strict";
import test from "node:test";

import { AppCause } from "@/server/errors";

import {
  fitsUploadTime,
  getEntitlements,
  MINUTE_MS,
  requireEntitlement,
  uploadTimeRemainingMs,
  visibleSpotlightCount,
} from "./entitlements";

test("PL-4 gated capabilities throw PLAN_REQUIRED for free users only", () => {
  for (const capability of ["scheduledRelease", "quietMode", "replaceAudio", "insightsBreakdowns"] as const) {
    assert.throws(
      () => requireEntitlement({ plan: "FREE" }, capability),
      (error: unknown) =>
        (error as { code?: string }).code === "FORBIDDEN" &&
        (error as { cause?: unknown }).cause instanceof AppCause &&
        ((error as { cause: AppCause }).cause).appCode === "PLAN_REQUIRED",
    );
    requireEntitlement({ plan: "PRO" }, capability);
  }
});

test("2.3 upload time: 180 minutes on Free, unlimited on Pro", () => {
  assert.equal(getEntitlements({ plan: "FREE" }).uploadTimeLimitMs, 180 * MINUTE_MS);
  assert.equal(uploadTimeRemainingMs({ plan: "FREE" }, 47 * MINUTE_MS), 133 * MINUTE_MS);
  assert.equal(uploadTimeRemainingMs({ plan: "FREE" }, 500 * MINUTE_MS), 0);
  assert.equal(uploadTimeRemainingMs({ plan: "PRO" }, 500 * MINUTE_MS), null);
  assert.ok(fitsUploadTime({ plan: "FREE" }, 170 * MINUTE_MS, 10 * MINUTE_MS));
  assert.ok(!fitsUploadTime({ plan: "FREE" }, 170 * MINUTE_MS, 10 * MINUTE_MS + 1));
  assert.ok(fitsUploadTime({ plan: "PRO" }, 10 ** 12, 10 ** 9));
});

test("2.3 spotlight and insights ranges follow the plan", () => {
  assert.equal(visibleSpotlightCount({ plan: "FREE" }), 1);
  assert.equal(visibleSpotlightCount({ plan: "PRO" }), 5);
  assert.deepEqual(getEntitlements({ plan: "FREE" }).insightsRangesDays, [7]);
  assert.deepEqual(getEntitlements({ plan: "PRO" }).insightsRangesDays, [7, 30, 90, 365]);
});
