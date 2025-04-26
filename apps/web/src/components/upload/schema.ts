import { z } from "zod";
import { GENRES, ALBUM_TYPES, PRIVACY_OPTIONS, ALBUM_PRIVACY_OPTIONS } from "./constants";

export const singleTrackSchema = z.object({
    title: z.string().min(1, "Title is required"),
    link: z.string().optional(),
    artwork: z.any().optional(), // Will be proper file validation
    genre: z.string().min(1, "Genre is required"),
    tags: z.string().optional(),
    description: z.string().optional(),
    privacy: z.enum(["public", "private", "schedule"]),
});

export const multipleTrackSchema = z.object({
    title: z.string().min(1, "Album title is required"),
    link: z.string().optional(),
    artwork: z.any().optional(), // Will be proper file validation
    genre: z.string().min(1, "Genre is required"),
    albumType: z.enum(["ALBUM", "EP"]),
    tags: z.string().optional(),
    description: z.string().optional(),
    privacy: z.enum(["public", "private"]),
});

export type SingleTrackFormData = z.infer<typeof singleTrackSchema>;
export type MultipleTrackFormData = z.infer<typeof multipleTrackSchema>;