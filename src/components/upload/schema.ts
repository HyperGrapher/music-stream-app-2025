import { z } from "zod";

export const singleTrackSchema = z.object({
  title: z.string().min(1, "Title is required"),
  artwork: z.string().uuid().optional(),
  genre: z.string().min(1, "Genre is required"),
  tags: z.string().optional(),
  description: z.string().optional(),
  privacy: z.enum(["public", "private"]),
});

export const multipleTrackSchema = z.object({
  title: z.string().min(1, "Release title is required"),
  artwork: z.string().uuid().optional(),
  genre: z.string().min(1, "Genre is required"),
  releaseType: z.enum(["ALBUM", "EP"]),
  tags: z.string().optional(),
  description: z.string().optional(),
  privacy: z.enum(["public", "private"]),
});

export type SingleTrackFormData = z.infer<typeof singleTrackSchema>;
export type MultipleTrackFormData = z.infer<typeof multipleTrackSchema>;
