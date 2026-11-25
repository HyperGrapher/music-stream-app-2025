/** Stable client DTO for player/UI state. Never expose Prisma records directly. */
export interface PlayerTrack {
  id: string;
  title: string;
  duration: number;
  userId?: string;
  artworkUrl?: string | null;
  waveformUrl?: string | null;
  waveformStatus?: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  description?: string | null;
  genre?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  releaseDate?: Date | string | null;
  playCount?: number;
  likeCount?: number;
  /** Whether the signed-in viewer liked this track (absent for anonymous viewers). */
  likedByMe?: boolean;
  commentCount?: number;
  repostCount?: number;
  downloadCount?: number;
  isOriginal?: boolean;
  isPrivate?: boolean;
  bpm?: number | null;
  key?: string | null;
  tags?: string | string[] | null;
  recordLabel?: string | null;
  albumId?: string | null;
  user?: {
    name: string;
    image?: string | null;
  };
}
