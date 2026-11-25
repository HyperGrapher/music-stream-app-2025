import assert from "node:assert/strict";
import { test } from "node:test";

import {
  artworkUrls,
  imageObjectKeys,
  planArtworkWidths,
  withArtworkWidth,
} from "./artwork";

test("planArtworkWidths caps at 640 and never upscales", () => {
  assert.deepEqual(planArtworkWidths(3000), [96, 320, 640]);
  assert.deepEqual(planArtworkWidths(640), [96, 320, 640]);
  assert.deepEqual(planArtworkWidths(462), [96, 320, 462]);
  assert.deepEqual(planArtworkWidths(320), [96, 320]);
  assert.deepEqual(planArtworkWidths(150.7), [96, 150]);
  assert.deepEqual(planArtworkWidths(40), [40]);
  assert.deepEqual(planArtworkWidths(0), []);
  assert.deepEqual(planArtworkWidths(Number.NaN), []);
});

test("rendition keys and URLs swap only the trailing width", () => {
  assert.equal(withArtworkWidth("artworks/u/a/640.webp", 96), "artworks/u/a/96.webp");
  assert.equal(
    withArtworkWidth("https://cdn.example/artworks/u/a/640.webp", 320),
    "https://cdn.example/artworks/u/a/320.webp",
  );
  // legacy single-object keys are left alone
  assert.equal(withArtworkWidth("artworks/u/x-cover.jpg", 96), "artworks/u/x-cover.jpg");
  assert.deepEqual(imageObjectKeys({ storageKey: "artworks/u/a/640.webp", imageWidths: [96, 320, 640] }), [
    "artworks/u/a/96.webp",
    "artworks/u/a/320.webp",
    "artworks/u/a/640.webp",
  ]);
  assert.deepEqual(imageObjectKeys({ storageKey: "artworks/u/x.jpg", imageWidths: [] }), ["artworks/u/x.jpg"]);
});

test("artworkUrls builds a srcset through the redirect route or the public bucket", () => {
  const route = "/api/tracks/t1/artwork";
  assert.deepEqual(artworkUrls(null, route), { artworkUrl: null, artworkSrcSet: null });
  assert.deepEqual(artworkUrls({ publicUrl: null, imageWidths: [] }, route), {
    artworkUrl: route,
    artworkSrcSet: null,
  });
  assert.deepEqual(artworkUrls({ publicUrl: null, imageWidths: [640, 96, 320] }, route), {
    artworkUrl: `${route}?w=640`,
    artworkSrcSet: `${route}?w=96 96w, ${route}?w=320 320w, ${route}?w=640 640w`,
  });
  assert.deepEqual(
    artworkUrls({ publicUrl: "https://cdn.example/artworks/u/a/462.webp", imageWidths: [96, 320, 462] }, route),
    {
      artworkUrl: "https://cdn.example/artworks/u/a/462.webp",
      artworkSrcSet:
        "https://cdn.example/artworks/u/a/96.webp 96w, https://cdn.example/artworks/u/a/320.webp 320w, https://cdn.example/artworks/u/a/462.webp 462w",
    },
  );
});
