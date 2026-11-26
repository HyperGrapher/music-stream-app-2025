import { slugify } from "@/lib/names";

/** Genres are stored as lowercase slugs: a canonical one, or a custom value slugified (max 30). */
export const normalizeGenre = (genre: string | null | undefined) => (genre ? slugify(genre, 30) || null : null);
