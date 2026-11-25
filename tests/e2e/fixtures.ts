/** Fixed data created by tests/e2e/seed.ts (valid v4 UUIDs, as the routes require). */
export const CREATOR_ID = "11111111-1111-4111-8111-111111111111";
export const CREATOR = { id: CREATOR_ID, username: "e2e-creator", name: "E2E Creator" } as const;

/** Fixed so tests can open the secret link without reading the database. */
export const PRIVATE_SECRET = "e2e-private-secret-0001";

const track = (
  n: number,
  slug: string,
  title: string,
  genre: string,
  playCount: number,
  extra: { visibility?: "PUBLIC" | "PRIVATE" | "SCHEDULED" } = {},
) => ({
  id: `2${n}111111-1111-4111-8111-111111111111`,
  slug,
  title,
  genre,
  playCount,
  visibility: extra.visibility ?? ("PUBLIC" as const),
  path: `/${CREATOR.username}/${slug}`,
});

export const TRACKS = {
  public: track(1, "e2e-public-track", "E2E Public Track", "electronic", 10),
  /** Only the likes spec touches this track's like counter. */
  likes: track(2, "e2e-likes-track", "E2E Likes Track", "rock", 0),
  private: track(3, "e2e-private-track", "E2E Private Track", "jazz-blues", 0, { visibility: "PRIVATE" }),
  /** Only used by the play-count test so other tests cannot interfere with its counter. */
  plays: track(4, "e2e-plays-track", "E2E Plays Track", "ambient", 0),
  /** Scheduled two days ahead: invisible everywhere until then. */
  scheduled: track(5, "e2e-scheduled-track", "E2E Scheduled Track", "world", 0, { visibility: "SCHEDULED" }),
} as const;

/** An album (public) with two tracks, and a private playlist. */
export const ALBUM = {
  id: "31111111-1111-4111-8111-111111111111",
  slug: "e2e-album",
  title: "E2E Album",
  path: `/${CREATOR.username}/sets/e2e-album`,
  tracks: [
    { id: "41111111-1111-4111-8111-111111111111", slug: "e2e-album-one", title: "E2E Album One" },
    { id: "42111111-1111-4111-8111-111111111111", slug: "e2e-album-two", title: "E2E Album Two" },
  ],
} as const;
export const PRIVATE_SET = {
  id: "32111111-1111-4111-8111-111111111111",
  slug: "e2e-private-set",
  title: "E2E Private Set",
  secret: "e2e-private-set-secret-1",
  path: `/${CREATOR.username}/sets/e2e-private-set`,
} as const;

/** Titles of every track a visitor may see, newest data first is not guaranteed. */
export const PUBLIC_TITLES = [
  TRACKS.public.title,
  TRACKS.likes.title,
  TRACKS.plays.title,
  ...ALBUM.tracks.map((t) => t.title),
];
