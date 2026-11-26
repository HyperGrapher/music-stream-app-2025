import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { friendlyError } from "./error-messages";

const zodMessage = JSON.stringify([
  { code: "invalid_format", format: "url", path: ["links", 0, "url"], message: "Invalid URL" },
  { code: "custom", path: ["links", 0, "url"], message: "Links must be http(s) URLs" },
]);

describe("friendlyError", () => {
  it("never shows raw validation JSON: invalid URLs say to start with https://", () => {
    const text = friendlyError({ message: zodMessage });
    assert.equal(text, "Link 1: enter a full web address starting with https://");
  });

  it("joins other validation messages, once each, and names the field", () => {
    const text = friendlyError({ message: JSON.stringify([{ code: "too_small", path: ["title"], message: "Too small: expected string to have >=1 characters" }, { code: "custom", path: ["tags", 2], message: "Too many tags" }]) });
    assert.equal(text, "Title: Too small: expected string to have >=1 characters. Tag 3: Too many tags");
    assert.ok(!text.startsWith("["));
  });

  it("passes ordinary messages through and still maps application codes", () => {
    assert.equal(friendlyError({ message: "That permalink is taken" }), "That permalink is taken");
    assert.equal(friendlyError({ message: "x", data: { appCode: "PLAN_REQUIRED" } }), "This is a Pro feature.");
    assert.equal(friendlyError({ message: "" }, "fallback"), "fallback");
    assert.equal(friendlyError({ message: "[not json" }), "[not json");
  });
});
