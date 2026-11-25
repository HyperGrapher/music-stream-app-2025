import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  firstFree,
  isReservedUsername,
  isValidUsername,
  normalizeTags,
  RESERVED_TRACK_SLUGS,
  RESERVED_USERNAMES,
  slugBase,
  slugify,
  usernameBase,
} from "./names";

test("IA-2 slugify: ascii, lowercase, hyphenated, bounded", () => {
  assert.equal(slugify("Gitarda Bir Riff #4!"), "gitarda-bir-riff-4");
  assert.equal(slugify("  Çığ Şöyle Ğüzel  "), "cig-soyle-guzel");
  assert.equal(slugify("Drum & Bass"), "drum-and-bass");
  assert.equal(slugify("日本語"), "");
  assert.equal(slugify("a".repeat(200)).length, 80);
  assert.equal(slugify("x".repeat(79) + " tail"), "x".repeat(79));
});

test("IA-2 slugBase never yields an empty or reserved profile sub-route slug", () => {
  assert.equal(slugBase("日本語"), "untitled");
  for (const reserved of RESERVED_TRACK_SLUGS) assert.notEqual(slugBase(reserved), reserved);
  assert.equal(slugBase("Popular Tracks"), "popular-tracks-1");
});

test("IA-1 usernames: shape and reserved words", () => {
  assert.ok(isValidUsername("ana_b-2"));
  assert.ok(isValidUsername("ABC")); // normalised to lowercase
  assert.ok(!isValidUsername("ab"));
  assert.ok(!isValidUsername("_ana"));
  assert.ok(!isValidUsername("a".repeat(26)));
  assert.ok(!isValidUsername("ana.b"));
  assert.ok(isReservedUsername("Admin"));
  assert.ok(!isValidUsername("settings"));
});

test("IA-1 every top-level route in src/app is a reserved username", () => {
  const app = join(import.meta.dirname, "..", "app");
  const segments = new Set<string>();
  const collect = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Route groups ((player)) add no URL segment: look inside them.
      if (/^\(.*\)$/.test(entry.name)) collect(join(dir, entry.name));
      else if (!entry.name.startsWith("[") && !entry.name.startsWith("_")) segments.add(entry.name);
    }
  };
  collect(app);
  for (const segment of segments) {
    assert.ok(RESERVED_USERNAMES.has(segment), `route /${segment} must be in RESERVED_USERNAMES`);
  }
});

test("usernameBase derives valid usernames from arbitrary text", () => {
  for (const seed of ["Ana María", "x", "", "日本", "admin", "Burak Mestan", "a-very-long-display-name-that-keeps-going"]) {
    assert.ok(isValidUsername(usernameBase(seed)), `${seed} -> ${usernameBase(seed)}`);
  }
  assert.equal(usernameBase("Ana María"), "ana_maria");
});

test("firstFree appends -2, -3 and respects the length limit", async () => {
  const taken = new Set(["song", "song-2", "abcde", "abcd-2"]);
  const isTaken = async (c: string) => taken.has(c);
  assert.equal(await firstFree("song", isTaken, 80), "song-3");
  assert.equal(await firstFree("fresh", isTaken, 80), "fresh");
  assert.equal(await firstFree("abcdef", async (c) => c === "abcde", 5), "abc-2");
});

test("tags are normalised, de-duplicated and bounded", () => {
  assert.deepEqual(normalizeTags("Lo-Fi, lo-fi , #chill!, a, Drum & Bass"), ["lo-fi", "chill", "drum & bass"]);
  assert.equal(normalizeTags(Array.from({ length: 50 }, (_, i) => `tag ${i}`)).length, 30);
  assert.deepEqual(normalizeTags("x".repeat(31)), []);
});
