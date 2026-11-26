import { z } from "zod";

import { LICENSES, SLUG_PATTERN } from "@/lib/track-fields";

/** Collection types as the editor offers them (PRD 7.4), with the helper text of research section 10.3. */
export const COLLECTION_TYPES = [
  { value: "PLAYLIST", label: "Playlist", hint: "A collection or mix of tracks" },
  { value: "ALBUM", label: "Album", hint: "A full-length release" },
  { value: "EP", label: "EP", hint: "A shorter multi-track release" },
  { value: "SINGLE", label: "Single", hint: "A standalone single release" },
  { value: "COMPILATION", label: "Compilation", hint: "Tracks grouped as a compilation" },
] as const;
export type CollectionTypeValue = (typeof COLLECTION_TYPES)[number]["value"];
export const isReleaseType = (type: string) => type !== "PLAYLIST";

const LICENSE_VALUES = LICENSES.map((l) => l.value) as [string, ...string[]];
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const MAX_COLLECTION_TRACKS = 500;
export const MAX_UPLOAD_BATCH = 100;

export const collectionFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  slug: z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens").optional(),
  type: z.enum(["PLAYLIST", "ALBUM", "EP", "SINGLE", "COMPILATION"]).optional(),
  description: text(4000),
  genre: z.string().trim().max(30).nullable().optional(),
  tags: z.array(z.string()).max(30).optional(),
  /** Collections cannot be scheduled. */
  privacy: z.enum(["public", "private"]).optional(),
  releaseDate: z.coerce.date().nullable().optional(),
  recordLabel: text(100),
  publisher: text(100),
  license: z.enum(LICENSE_VALUES).nullable().optional(),
  artworkAssetId: z.string().uuid().nullable().optional(),
});
export type CollectionFields = z.infer<typeof collectionFieldsSchema>;

/** Release types need a release date (PRD 7.4); playlists do not. */
export function releaseDateProblem(type: string, releaseDate: Date | null | undefined): string | null {
  return isReleaseType(type) && !releaseDate ? "Add a release date" : null;
}
