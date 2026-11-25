export { GENRES } from "@/lib/genres";

export const ALBUM_TYPES = [
    { value: 'ALBUM', label: 'Album' },
    { value: 'EP', label: 'EP' },
] as const;

export const PRIVACY_OPTIONS = [
    { value: 'public', label: 'Public' },
    { value: 'private', label: 'Private' },
] as const;

export const ALBUM_PRIVACY_OPTIONS = [
    { value: 'public', label: 'Public' },
    { value: 'private', label: 'Private' },
] as const;