import assert from "node:assert/strict";
import test from "node:test";

import { needsOnboardingRedirect } from "./onboarding-rule";

test("6.2: a not-yet-onboarded user is sent to /onboarding from everywhere except auth, legal and onboarding itself", () => {
  const fresh = { onboardedAt: null };
  for (const path of ["/", "/discover", "/demo", "/demo/some-track", "/upload", "/settings", "/feed"]) {
    assert.equal(needsOnboardingRedirect(fresh, path), true, path);
  }
  for (const path of ["/onboarding", "/signin", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/terms", "/privacy", "/copyright"]) {
    assert.equal(needsOnboardingRedirect(fresh, path), false, path);
  }
  // look-alikes are not exempt
  assert.equal(needsOnboardingRedirect(fresh, "/onboarding-fake"), true);
});

test("onboarded users and visitors are never redirected", () => {
  assert.equal(needsOnboardingRedirect({ onboardedAt: new Date() }, "/discover"), false);
  assert.equal(needsOnboardingRedirect({ onboardedAt: "2030-01-01T00:00:00Z" }, "/"), false);
  assert.equal(needsOnboardingRedirect(null, "/"), false);
});
