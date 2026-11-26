/** Stable client DTO for player/UI state. Never expose Prisma records directly. */
export interface PlayerTrack {
  id: string;
  title: string;
  /** Permalink slug (`/{username}/{slug}`). */
  slug?: string;
  /** Canonical page URL of the track, secret-link form included when it was reached that way. */
  permalink?: string;
  /** Same-origin stream URL, carrying the secret-link proof when the track is hidden. */
  streamUrl?: string;
  /** `s=<token>` / `c=<id>&s=<token>` to append to play-count requests; empty for public tracks. */
  accessQuery?: string;
  /** Artist display text (`artistName` override, else the creator's name). */
  artistName?: string | null;
  duration: number;
  /** Audio mime type, so the player can skip formats the browser cannot play. */
  mimeType?: string;
  userId?: string;
  artworkUrl?: string | null;
  /** `srcset` of the artwork renditions (absent for legacy single-size images). */
  artworkSrcSet?: string | null;
  waveformUrl?: string | null;
  waveformStatus?: "READY" | "FAILED";
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
  /** The creator allows signed-in listeners to download the original file. */
  downloadable?: boolean;
  /** The creator allows the track to be embedded on other sites. */
  embeddable?: boolean;
  isOriginal?: boolean;
  isPrivate?: boolean;
  bpm?: number | null;
  key?: string | null;
  tags?: string[] | null;
  recordLabel?: string | null;
  albumId?: string | null;
  user?: {
    name: string;
    username?: string;
    image?: string | null;
  };
}
