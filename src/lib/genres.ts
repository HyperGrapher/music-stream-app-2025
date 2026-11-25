/** Canonical genres (PRD GT-1), stored as the `value` slug. Custom genres are free text slugified. */
export const GENRES = [
  { value: "alternative-rock", label: "Alternative Rock" },
  { value: "ambient", label: "Ambient" },
  { value: "classical", label: "Classical" },
  { value: "country", label: "Country" },
  { value: "dance-edm", label: "Dance & EDM" },
  { value: "dancehall", label: "Dancehall" },
  { value: "deep-house", label: "Deep House" },
  { value: "disco", label: "Disco" },
  { value: "drum-and-bass", label: "Drum & Bass" },
  { value: "dubstep", label: "Dubstep" },
  { value: "electronic", label: "Electronic" },
  { value: "folk-singer-songwriter", label: "Folk & Singer-Songwriter" },
  { value: "hip-hop-rap", label: "Hip-hop & Rap" },
  { value: "house", label: "House" },
  { value: "indie", label: "Indie" },
  { value: "jazz-blues", label: "Jazz & Blues" },
  { value: "latin", label: "Latin" },
  { value: "metal", label: "Metal" },
  { value: "piano", label: "Piano" },
  { value: "pop", label: "Pop" },
  { value: "rnb-soul", label: "R&B & Soul" },
  { value: "reggae", label: "Reggae" },
  { value: "reggaeton", label: "Reggaeton" },
  { value: "rock", label: "Rock" },
  { value: "soundtrack", label: "Soundtrack" },
  { value: "techno", label: "Techno" },
  { value: "trance", label: "Trance" },
  { value: "trap", label: "Trap" },
  { value: "triphop", label: "Triphop" },
  { value: "world", label: "World" },
  { value: "podcast", label: "Podcast" },
  { value: "audiobooks", label: "Audiobooks" },
  { value: "comedy", label: "Comedy" },
  { value: "spoken-word", label: "Spoken word" },
] as const;

export type GenreSlug = (typeof GENRES)[number]["value"];

/** Display name for a stored genre value ("hip-hop-rap" -> "Hip-hop & Rap"); unknown values are title-cased. */
export function genreLabel(value: string): string {
  const known = GENRES.find((genre) => genre.value === value);
  if (known) return known.label;
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
