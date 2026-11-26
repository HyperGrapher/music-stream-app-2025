import assert from "node:assert/strict";
import test from "node:test";

import { passwordProblem } from "./passwords";

test("AU-3: short, common and trivially derived passwords are refused", () => {
  assert.equal(passwordProblem("short"), "TOO_SHORT");
  assert.equal(passwordProblem("password"), "TOO_COMMON");
  assert.equal(passwordProblem("PASSWORD123"), "TOO_COMMON");
  assert.equal(passwordProblem("aaaaaaaaaa"), "TOO_COMMON");
  assert.equal(passwordProblem("x".repeat(129)), "TOO_LONG");
  assert.equal(passwordProblem("ana.banana", { email: "ana.banana@example.com" }), "TOO_COMMON");
  assert.equal(passwordProblem("MyUsername", { username: "myusername" }), "TOO_COMMON");
});

test("a reasonable password passes", () => {
  assert.equal(passwordProblem("correct horse battery staple"), null);
  assert.equal(passwordProblem("Tr0ub4dor&3x"), null);
});
