import { z } from "zod";

import { GENRES } from "@/lib/genres";

/**
 * Editable fields of a track (PRD 7.3), shared by the upload editor, the edit page and the server.
 * Everything is optional here; the create/update procedures decide what is required.
 */
export const MUSICAL_KEYS = [
  "C major", "C minor", "C# major", "C# minor", "D major", "D minor", "D# major", "D# minor", "E major", "E minor", "F major", "F minor",
  "F# major", "F# minor", "G major", "G minor", "G# major", "G# minor", "A major", "A minor", "A# major", "A# minor", "B major", "B minor",
] as const;

export const LICENSES = [
  { value: "ALL_RIGHTS_RESERVED", label: "All rights reserved", hint: "Nobody may reuse your music without asking you." },
  { value: "CC0", label: "CC0 (public domain)", hint: "Anyone may use it for anything." },
  { value: "CC_BY", label: "CC BY", hint: "Reuse allowed with credit." },
  { value: "CC_BY_SA", label: "CC BY-SA", hint: "Reuse with credit; derivatives use the same license." },
  { value: "CC_BY_ND", label: "CC BY-ND", hint: "Reuse with credit; no changes." },
  { value: "CC_BY_NC", label: "CC BY-NC", hint: "Reuse with credit; non-commercial only." },
  { value: "CC_BY_NC_SA", label: "CC BY-NC-SA", hint: "Non-commercial, credit, share-alike." },
  { value: "CC_BY_NC_ND", label: "CC BY-NC-ND", hint: "Non-commercial, credit, no changes." },
] as const;
const LICENSE_VALUES = LICENSES.map((l) => l.value) as [string, ...string[]];

/** ISRC without hyphens (CCXXXYYNNNNN): 2 letters, 3 alphanumerics, 2 digits, 5 digits. */
export function normalizeIsrc(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(compact) ? compact : null;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GENRE_VALUES = GENRES.map((g) => g.value) as [string, ...string[]];

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const httpsUrl = z.string().trim().max(300).url().refine((v) => v.startsWith("https://"), "Use an https:// link");

export const privacySchema = z.enum(["public", "private", "scheduled"]);

export const trackFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(100),
  /** Permalink slug; generated from the title when omitted. */
  slug: z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN, "Use lowercase letters, numbers and hyphens").optional(),
  artistName: optionalText(100),
  featuredArtists: optionalText(200),
  genre: z.string().trim().max(30).nullable().optional(),
  tags: z.array(z.string()).max(30).optional(),
  description: optionalText(4000),
  privacy: privacySchema.optional(),
  /** Required for `scheduled`: UTC instant, 5 minutes to 1 year ahead (checked on the server). */
  publishAt: z.coerce.date().nullable().optional(),
  releaseDate: z.coerce.date().nullable().optional(),
  recordLabel: optionalText(100),
  publisher: optionalText(100),
  isrc: z.string().trim().max(20).nullable().optional().refine((v) => !v || normalizeIsrc(v) !== null, "ISRC looks like CC-XXX-YY-NNNNN"),
  bpm: z.number().int().min(20).max(300).nullable().optional(),
  musicalKey: z.enum(MUSICAL_KEYS).nullable().optional(),
  explicit: z.boolean().optional(),
  buyUrl: httpsUrl.nullable().optional().or(z.literal("").transform(() => null)),
  buyTitle: optionalText(30),
  license: z.enum(LICENSE_VALUES).optional(),
  downloadable: z.boolean().optional(),
  commentsEnabled: z.boolean().optional(),
  statsPublic: z.boolean().optional(),
  embeddable: z.boolean().optional(),
  previewStartMs: z.number().int().min(0).max(4 * 3_600_000).optional(),
  artworkAssetId: z.string().uuid().nullable().optional(),
});

export type TrackFields = z.infer<typeof trackFieldsSchema>;

/** A title from a file name: no extension, `_`/`-` as spaces, no leading track number ("01 - "). */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/^\s*\d{1,3}\s*[-.)]\s+/, "").replace(/\s+-\s+/g, " - ").replace(/\s+/g, " ").trim();
  return base || "Untitled";
}

/** Default start of the 30 s preview: 0 for tracks under a minute, else 25 % in (PRD 7.3). */
export function defaultPreviewStartMs(durationMs: number): number {
  return durationMs < 60_000 ? 0 : Math.min(Math.floor(durationMs * 0.25), Math.max(0, durationMs - 30_000));
}

/** Schedules must be 5 minutes to a year ahead (PRD 7.3). */
export function scheduleProblem(publishAt: Date, now: Date): string | null {
  if (publishAt.getTime() < now.getTime() + 5 * 60_000) return "Choose a time at least 5 minutes from now";
  if (publishAt.getTime() > now.getTime() + 366 * 86_400_000) return "Choose a time within the next year";
  return null;
}
