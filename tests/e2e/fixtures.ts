/** Fixed ids for the data created by tests/e2e/seed.ts (valid v4 UUIDs, as the routes require). */
export const CREATOR_ID = "11111111-1111-4111-8111-111111111111";

export const TRACKS = {
  public: { id: "21111111-1111-4111-8111-111111111111", title: "E2E Public Track", genre: "electronic", playCount: 10 },
  unlisted: { id: "22222222-1111-4111-8111-111111111111", title: "E2E Unlisted Track", genre: "jazz", playCount: 0 },
  private: { id: "23333333-1111-4111-8111-111111111111", title: "E2E Private Track", genre: "jazz", playCount: 0 },
  /** Only used by the play-count test so other tests cannot interfere with its counter. */
  plays: { id: "24444444-1111-4111-8111-111111111111", title: "E2E Plays Track", genre: "ambient", playCount: 0 },
} as const;
