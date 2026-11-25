-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AUDIO', 'IMAGE', 'WAVEFORM');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'ATTACHED', 'DELETING', 'FAILED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('CLOUDFLARE_R2');

-- CreateEnum
CREATE TYPE "AudioAnalysisStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaProcessingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('ALBUM', 'EP', 'SINGLE', 'SET', 'COMPILATION');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW', 'LIKE', 'COMMENT', 'REPOST', 'PLAYLIST_ADD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('USER', 'TRACK', 'RELEASE', 'PLAYLIST', 'COMMENT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "website" TEXT,
    "bannerUrl" TEXT,
    "profileViews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "StorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "attachedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_analysis" (
    "id" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "status" "AudioAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "durationMs" INTEGER,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "codec" TEXT,
    "bitRate" BIGINT,
    "waveformVersion" INTEGER NOT NULL DEFAULT 1,
    "detailPixelsPerSecond" INTEGER NOT NULL DEFAULT 100,
    "overviewPixelsPerSecond" INTEGER NOT NULL DEFAULT 20,
    "waveformBits" INTEGER NOT NULL DEFAULT 8,
    "detailWaveformAssetId" TEXT,
    "overviewWaveformAssetId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_processing_job" (
    "id" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "status" "MediaProcessingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_processing_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "artworkAssetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "isOriginal" BOOLEAN NOT NULL DEFAULT true,
    "genre" TEXT,
    "bpm" INTEGER,
    "musicalKey" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "releaseDate" TIMESTAMP(3),
    "recordLabel" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "artworkAssetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReleaseType" NOT NULL DEFAULT 'SET',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "releaseDate" TIMESTAMP(3),
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_track" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "artworkAssetId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "isCollaborative" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_track" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "timestampSeconds" INTEGER,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_like" (
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_like_pkey" PRIMARY KEY ("userId","commentId")
);

-- CreateTable
CREATE TABLE "track_like" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_like_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "release_like" (
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_like_pkey" PRIMARY KEY ("userId","releaseId")
);

-- CreateTable
CREATE TABLE "playlist_like" (
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_like_pkey" PRIMARY KEY ("userId","playlistId")
);

-- CreateTable
CREATE TABLE "track_repost" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_repost_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "release_repost" (
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_repost_pkey" PRIMARY KEY ("userId","releaseId")
);

-- CreateTable
CREATE TABLE "playlist_repost" (
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_repost_pkey" PRIMARY KEY ("userId","playlistId")
);

-- CreateTable
CREATE TABLE "follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "play_event" (
    "id" TEXT NOT NULL,
    "listenerId" TEXT,
    "trackId" TEXT NOT NULL,
    "listenedSeconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "entityType" "NotificationEntityType",
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_processing_error" (
    "id" TEXT NOT NULL,
    "trackId" TEXT,
    "assetId" TEXT,
    "requestId" TEXT,
    "operation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_processing_error_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storageKey_key" ON "media_asset"("storageKey");

-- CreateIndex
CREATE INDEX "media_asset_ownerId_status_expiresAt_idx" ON "media_asset"("ownerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "media_asset_kind_status_idx" ON "media_asset"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audio_analysis_audioAssetId_key" ON "audio_analysis"("audioAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_analysis_detailWaveformAssetId_key" ON "audio_analysis"("detailWaveformAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_analysis_overviewWaveformAssetId_key" ON "audio_analysis"("overviewWaveformAssetId");

-- CreateIndex
CREATE INDEX "audio_analysis_status_updatedAt_idx" ON "audio_analysis"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "media_processing_job_audioAssetId_key" ON "media_processing_job"("audioAssetId");

-- CreateIndex
CREATE INDEX "media_processing_job_status_availableAt_createdAt_idx" ON "media_processing_job"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "track_audioAssetId_key" ON "track"("audioAssetId");

-- CreateIndex
CREATE INDEX "track_creatorId_createdAt_idx" ON "track"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "track_visibility_createdAt_idx" ON "track"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "track_genre_idx" ON "track"("genre");

-- CreateIndex
CREATE INDEX "release_creatorId_createdAt_idx" ON "release"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "release_visibility_releaseDate_idx" ON "release"("visibility", "releaseDate");

-- CreateIndex
CREATE INDEX "release_track_trackId_idx" ON "release_track"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "release_track_releaseId_trackId_key" ON "release_track"("releaseId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "release_track_releaseId_position_key" ON "release_track"("releaseId", "position");

-- CreateIndex
CREATE INDEX "playlist_ownerId_createdAt_idx" ON "playlist"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "playlist_visibility_createdAt_idx" ON "playlist"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "playlist_track_trackId_idx" ON "playlist_track"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_track_playlistId_trackId_key" ON "playlist_track"("playlistId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_track_playlistId_position_key" ON "playlist_track"("playlistId", "position");

-- CreateIndex
CREATE INDEX "comment_trackId_createdAt_idx" ON "comment"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "comment_authorId_idx" ON "comment"("authorId");

-- CreateIndex
CREATE INDEX "comment_parentId_idx" ON "comment"("parentId");

-- CreateIndex
CREATE INDEX "comment_like_commentId_idx" ON "comment_like"("commentId");

-- CreateIndex
CREATE INDEX "track_like_trackId_idx" ON "track_like"("trackId");

-- CreateIndex
CREATE INDEX "release_like_releaseId_idx" ON "release_like"("releaseId");

-- CreateIndex
CREATE INDEX "playlist_like_playlistId_idx" ON "playlist_like"("playlistId");

-- CreateIndex
CREATE INDEX "track_repost_trackId_idx" ON "track_repost"("trackId");

-- CreateIndex
CREATE INDEX "release_repost_releaseId_idx" ON "release_repost"("releaseId");

-- CreateIndex
CREATE INDEX "playlist_repost_playlistId_idx" ON "playlist_repost"("playlistId");

-- CreateIndex
CREATE INDEX "follow_followingId_idx" ON "follow"("followingId");

-- CreateIndex
CREATE INDEX "play_event_listenerId_createdAt_idx" ON "play_event"("listenerId", "createdAt");

-- CreateIndex
CREATE INDEX "play_event_trackId_createdAt_idx" ON "play_event"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_recipientId_readAt_createdAt_idx" ON "notification"("recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "media_processing_error_trackId_createdAt_idx" ON "media_processing_error"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "media_processing_error_assetId_createdAt_idx" ON "media_processing_error"("assetId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_analysis" ADD CONSTRAINT "audio_analysis_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_analysis" ADD CONSTRAINT "audio_analysis_detailWaveformAssetId_fkey" FOREIGN KEY ("detailWaveformAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_analysis" ADD CONSTRAINT "audio_analysis_overviewWaveformAssetId_fkey" FOREIGN KEY ("overviewWaveformAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_processing_job" ADD CONSTRAINT "media_processing_job_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_track" ADD CONSTRAINT "release_track_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_track" ADD CONSTRAINT "release_track_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_like" ADD CONSTRAINT "track_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_like" ADD CONSTRAINT "track_like_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_like" ADD CONSTRAINT "release_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_like" ADD CONSTRAINT "release_like_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_like" ADD CONSTRAINT "playlist_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_like" ADD CONSTRAINT "playlist_like_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_repost" ADD CONSTRAINT "track_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_repost" ADD CONSTRAINT "track_repost_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_repost" ADD CONSTRAINT "release_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_repost" ADD CONSTRAINT "release_repost_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_repost" ADD CONSTRAINT "playlist_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_repost" ADD CONSTRAINT "playlist_repost_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_event" ADD CONSTRAINT "play_event_listenerId_fkey" FOREIGN KEY ("listenerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_event" ADD CONSTRAINT "play_event_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_processing_error" ADD CONSTRAINT "media_processing_error_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_processing_error" ADD CONSTRAINT "media_processing_error_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

