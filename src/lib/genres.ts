import { GENRES } from "@/components/upload/constants";

/** Display name for a stored genre value ("hip-hop" -> "Hip Hop"); unknown values are title-cased. */
export function genreLabel(value: string): string {
  const known = GENRES.find((genre) => genre.value === value);
  if (known) return known.label;
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
