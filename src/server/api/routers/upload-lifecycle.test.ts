import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicObjectUrl,
  getMediaAssetPrefix,
  isOwnedMediaAsset,
  normalizeObjectContentType,
} from "./upload-lifecycle";

test("media asset prefixes are kind-specific and owner-scoped", () => {
  assert.equal(getMediaAssetPrefix("audio", "user-1"), "uploads/user-1/");
  assert.equal(getMediaAssetPrefix("artwork", "user-1"), "artworks/user-1/");

  assert.equal(
    isOwnedMediaAsset("uploads/user-1/id-song.mp3", "audio", "user-1"),
    true,
  );
  assert.equal(
    isOwnedMediaAsset("artworks/user-1/id-cover.png", "artwork", "user-1"),
    true,
  );
});

test("media asset ownership rejects another user and the wrong object kind", () => {
  assert.equal(
    isOwnedMediaAsset("uploads/user-2/id-song.mp3", "audio", "user-1"),
    false,
  );
  assert.equal(
    isOwnedMediaAsset("uploads/user-10/id-song.mp3", "audio", "user-1"),
    false,
  );
  assert.equal(
    isOwnedMediaAsset("artworks/user-1/id-cover.png", "audio", "user-1"),
    false,
  );
});

test("object content types are normalized before allow-list checks", () => {
  assert.equal(
    normalizeObjectContentType(" Audio/MPEG; charset=binary "),
    "audio/mpeg",
  );
  assert.equal(normalizeObjectContentType("image/png"), "image/png");
  assert.equal(normalizeObjectContentType(undefined), undefined);
});

test("public artwork URLs retain base paths and encode each key segment", () => {
  assert.equal(
    buildPublicObjectUrl(
      "https://media.example.com/public",
      "artworks/user-1/cover #1.png",
    ),
    "https://media.example.com/public/artworks/user-1/cover%20%231.png",
  );
});
