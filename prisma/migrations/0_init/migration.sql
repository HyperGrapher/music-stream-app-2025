-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessagePolicy" AS ENUM ('EVERYONE', 'FOLLOWING', 'NOBODY');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ModerationState" AS ENUM ('VISIBLE', 'REMOVED');

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('PLAYLIST', 'ALBUM', 'EP', 'SINGLE', 'COMPILATION');

-- CreateEnum
CREATE TYPE "License" AS ENUM ('ALL_RIGHTS_RESERVED', 'CC0', 'CC_BY', 'CC_BY_SA', 'CC_BY_ND', 'CC_BY_NC', 'CC_BY_NC_SA', 'CC_BY_NC_ND');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('AUDIO', 'IMAGE', 'WAVEFORM');

-- CreateEnum
CREATE TYPE "ImagePurpose" AS ENUM ('ARTWORK', 'AVATAR', 'BANNER');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'ATTACHED', 'DELETING', 'FAILED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('CLOUDFLARE_R2');

-- CreateEnum
CREATE TYPE "AudioAnalysisStatus" AS ENUM ('READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('TRACK_POSTED', 'COLLECTION_POSTED', 'TRACK_REPOSTED', 'COLLECTION_REPOSTED');

-- CreateEnum
CREATE TYPE "PlaySource" AS ENUM ('PROFILE', 'TRACK_PAGE', 'COLLECTION', 'FEED', 'HOME', 'DISCOVER', 'SEARCH', 'CHARTS', 'LIBRARY', 'HISTORY', 'STATION', 'EMBED', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW', 'TRACK_LIKE', 'COLLECTION_LIKE', 'TRACK_REPOST', 'COLLECTION_REPOST', 'COMMENT', 'REPLY', 'MENTION', 'COMMENT_LIKE', 'PLAYLIST_ADD', 'NEW_RELEASE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailFrequency" AS ENUM ('OFF', 'DAILY', 'IMMEDIATE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'LOGGED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('COPYRIGHT', 'SPAM', 'HARASSMENT', 'HATE', 'SEXUAL', 'VIOLENCE', 'IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('TRACK', 'COLLECTION', 'COMMENT', 'USER', 'MESSAGE');

-- CreateEnum
CREATE TYPE "RedirectKind" AS ENUM ('TRACK', 'COLLECTION');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "avatarAssetId" TEXT,
    "bannerAssetId" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "countryCode" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "planChangedAt" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedReason" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "favoriteGenres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "historyClearedAt" TIMESTAMP(3),
    "messagePolicy" "MessagePolicy" NOT NULL DEFAULT 'FOLLOWING',
    "showLikes" BOOLEAN NOT NULL DEFAULT true,
    "showInTopListeners" BOOLEAN NOT NULL DEFAULT true,
    "emailFrequency" "EmailFrequency" NOT NULL DEFAULT 'DAILY',
    "showWaveformComments" BOOLEAN NOT NULL DEFAULT true,
    "defaultLicense" "License" NOT NULL DEFAULT 'ALL_RIGHTS_RESERVED',
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "publicTrackCount" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "profile_link" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "profile_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "username_redirect" (
    "oldUsername" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "username_redirect_pkey" PRIMARY KEY ("oldUsername")
);

-- CreateTable
CREATE TABLE "slug_redirect" (
    "ownerId" TEXT NOT NULL,
    "kind" "RedirectKind" NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "slug_redirect_pkey" PRIMARY KEY ("ownerId","kind","oldSlug")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "imagePurpose" "ImagePurpose",
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "StorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT,
    "publicUrl" TEXT,
    "imageWidths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
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
    "status" "AudioAnalysisStatus" NOT NULL,
    "durationMs" INTEGER,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "waveformVersion" INTEGER NOT NULL DEFAULT 1,
    "overviewPixelsPerSecond" INTEGER NOT NULL DEFAULT 20,
    "overviewWaveformAssetId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_deletion" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_deletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "artworkAssetId" TEXT,
    "title" TEXT NOT NULL,
    "artistName" TEXT,
    "featuredArtists" TEXT,
    "description" TEXT,
    "genre" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "secretToken" TEXT NOT NULL,
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "moderationState" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "moderationReason" TEXT,
    "releaseDate" TIMESTAMP(3),
    "isrc" TEXT,
    "recordLabel" TEXT,
    "publisher" TEXT,
    "buyUrl" TEXT,
    "buyTitle" TEXT,
    "license" "License" NOT NULL DEFAULT 'ALL_RIGHTS_RESERVED',
    "bpm" INTEGER,
    "musicalKey" TEXT,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "previewStartMs" INTEGER NOT NULL DEFAULT 0,
    "downloadable" BOOLEAN NOT NULL DEFAULT false,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "statsPublic" BOOLEAN NOT NULL DEFAULT true,
    "embeddable" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CollectionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "artworkAssetId" TEXT,
    "genre" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "Visibility" NOT NULL,
    "secretToken" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "releaseDate" TIMESTAMP(3),
    "recordLabel" TEXT,
    "publisher" TEXT,
    "license" "License",
    "moderationState" "ModerationState" NOT NULL DEFAULT 'VISIBLE',
    "moderationReason" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_track" (
    "collectionId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedById" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_track_pkey" PRIMARY KEY ("collectionId","trackId")
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
CREATE TABLE "track_like" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_like_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "collection_like" (
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_like_pkey" PRIMARY KEY ("userId","collectionId")
);

-- CreateTable
CREATE TABLE "comment_like" (
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_like_pkey" PRIMARY KEY ("userId","commentId")
);

-- CreateTable
CREATE TABLE "track_repost" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_repost_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "collection_repost" (
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_repost_pkey" PRIMARY KEY ("userId","collectionId")
);

-- CreateTable
CREATE TABLE "follow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "block" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "trackId" TEXT,
    "collectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotlight_item" (
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "trackId" TEXT,
    "collectionId" TEXT,

    CONSTRAINT "spotlight_item_pkey" PRIMARY KEY ("userId","position")
);

-- CreateTable
CREATE TABLE "play_event" (
    "id" TEXT NOT NULL,
    "listenerId" TEXT,
    "trackId" TEXT NOT NULL,
    "collectionId" TEXT,
    "source" "PlaySource" NOT NULL DEFAULT 'OTHER',
    "countryCode" TEXT,
    "clientHash" TEXT,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "listenedMs" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_daily_stat" (
    "trackId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "track_daily_stat_pkey" PRIMARY KEY ("trackId","day")
);

-- CreateTable
CREATE TABLE "user_daily_stat" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "lostFollowers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_daily_stat_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "trackId" TEXT,
    "collectionId" TEXT,
    "commentId" TEXT,
    "groupKey" TEXT NOT NULL,
    "message" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_member" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "conversation_member_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "extra" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_action" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_message" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "bodyHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "profile_link_userId_position_idx" ON "profile_link"("userId", "position");

-- CreateIndex
CREATE INDEX "username_redirect_userId_idx" ON "username_redirect"("userId");

-- CreateIndex
CREATE INDEX "slug_redirect_targetId_idx" ON "slug_redirect"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "media_asset_storageKey_key" ON "media_asset"("storageKey");

-- CreateIndex
CREATE INDEX "media_asset_ownerId_status_expiresAt_idx" ON "media_asset"("ownerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "media_asset_kind_status_idx" ON "media_asset"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "audio_analysis_audioAssetId_key" ON "audio_analysis"("audioAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_analysis_overviewWaveformAssetId_key" ON "audio_analysis"("overviewWaveformAssetId");

-- CreateIndex
CREATE INDEX "storage_deletion_createdAt_idx" ON "storage_deletion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "storage_deletion_bucket_key_key" ON "storage_deletion"("bucket", "key");

-- CreateIndex
CREATE INDEX "track_creatorId_publishedAt_idx" ON "track"("creatorId", "publishedAt");

-- CreateIndex
CREATE INDEX "track_visibility_publishedAt_idx" ON "track"("visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "track_visibility_publishAt_idx" ON "track"("visibility", "publishAt");

-- CreateIndex
CREATE INDEX "track_genre_idx" ON "track"("genre");

-- CreateIndex
CREATE INDEX "track_tags_idx" ON "track" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "track_creatorId_slug_key" ON "track"("creatorId", "slug");

-- CreateIndex
CREATE INDEX "collection_ownerId_publishedAt_idx" ON "collection"("ownerId", "publishedAt");

-- CreateIndex
CREATE INDEX "collection_visibility_publishedAt_idx" ON "collection"("visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "collection_type_idx" ON "collection"("type");

-- CreateIndex
CREATE INDEX "collection_tags_idx" ON "collection" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "collection_ownerId_slug_key" ON "collection"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "collection_track_collectionId_position_idx" ON "collection_track"("collectionId", "position");

-- CreateIndex
CREATE INDEX "collection_track_trackId_idx" ON "collection_track"("trackId");

-- CreateIndex
CREATE INDEX "comment_trackId_createdAt_idx" ON "comment"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "comment_authorId_idx" ON "comment"("authorId");

-- CreateIndex
CREATE INDEX "comment_parentId_idx" ON "comment"("parentId");

-- CreateIndex
CREATE INDEX "track_like_trackId_idx" ON "track_like"("trackId");

-- CreateIndex
CREATE INDEX "track_like_userId_createdAt_idx" ON "track_like"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "collection_like_collectionId_idx" ON "collection_like"("collectionId");

-- CreateIndex
CREATE INDEX "collection_like_userId_createdAt_idx" ON "collection_like"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "comment_like_commentId_idx" ON "comment_like"("commentId");

-- CreateIndex
CREATE INDEX "track_repost_trackId_idx" ON "track_repost"("trackId");

-- CreateIndex
CREATE INDEX "track_repost_userId_createdAt_idx" ON "track_repost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "collection_repost_collectionId_idx" ON "collection_repost"("collectionId");

-- CreateIndex
CREATE INDEX "collection_repost_userId_createdAt_idx" ON "collection_repost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "follow_followingId_createdAt_idx" ON "follow"("followingId", "createdAt");

-- CreateIndex
CREATE INDEX "follow_followerId_createdAt_idx" ON "follow"("followerId", "createdAt");

-- CreateIndex
CREATE INDEX "block_blockedId_idx" ON "block"("blockedId");

-- CreateIndex
CREATE INDEX "activity_actorId_createdAt_idx" ON "activity"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_trackId_idx" ON "activity"("trackId");

-- CreateIndex
CREATE INDEX "activity_collectionId_idx" ON "activity"("collectionId");

-- CreateIndex
CREATE INDEX "play_event_trackId_createdAt_idx" ON "play_event"("trackId", "createdAt");

-- CreateIndex
CREATE INDEX "play_event_trackId_counted_createdAt_idx" ON "play_event"("trackId", "counted", "createdAt");

-- CreateIndex
CREATE INDEX "play_event_listenerId_createdAt_idx" ON "play_event"("listenerId", "createdAt");

-- CreateIndex
CREATE INDEX "play_event_trackId_clientHash_createdAt_idx" ON "play_event"("trackId", "clientHash", "createdAt");

-- CreateIndex
CREATE INDEX "track_daily_stat_day_idx" ON "track_daily_stat"("day");

-- CreateIndex
CREATE INDEX "notification_recipientId_createdAt_idx" ON "notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_recipientId_readAt_idx" ON "notification"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "notification_recipientId_groupKey_idx" ON "notification"("recipientId", "groupKey");

-- CreateIndex
CREATE INDEX "conversation_member_userId_idx" ON "conversation_member"("userId");

-- CreateIndex
CREATE INDEX "message_conversationId_createdAt_idx" ON "message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "report_status_createdAt_idx" ON "report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "report_targetType_targetId_idx" ON "report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "report_reporterId_targetType_targetId_status_idx" ON "report"("reporterId", "targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "moderation_action_targetType_targetId_createdAt_idx" ON "moderation_action"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "email_message_to_createdAt_idx" ON "email_message"("to", "createdAt");

-- CreateIndex
CREATE INDEX "email_message_template_createdAt_idx" ON "email_message"("template", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_windowStart_idx" ON "rate_limit_bucket"("windowStart");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_bannerAssetId_fkey" FOREIGN KEY ("bannerAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_link" ADD CONSTRAINT "profile_link_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "username_redirect" ADD CONSTRAINT "username_redirect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_analysis" ADD CONSTRAINT "audio_analysis_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_analysis" ADD CONSTRAINT "audio_analysis_overviewWaveformAssetId_fkey" FOREIGN KEY ("overviewWaveformAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track" ADD CONSTRAINT "track_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection" ADD CONSTRAINT "collection_artworkAssetId_fkey" FOREIGN KEY ("artworkAssetId") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_track" ADD CONSTRAINT "collection_track_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_track" ADD CONSTRAINT "collection_track_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_track" ADD CONSTRAINT "collection_track_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment" ADD CONSTRAINT "comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_like" ADD CONSTRAINT "track_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_like" ADD CONSTRAINT "track_like_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_like" ADD CONSTRAINT "collection_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_like" ADD CONSTRAINT "collection_like_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_repost" ADD CONSTRAINT "track_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_repost" ADD CONSTRAINT "track_repost_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_repost" ADD CONSTRAINT "collection_repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_repost" ADD CONSTRAINT "collection_repost_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow" ADD CONSTRAINT "follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block" ADD CONSTRAINT "block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_item" ADD CONSTRAINT "spotlight_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_item" ADD CONSTRAINT "spotlight_item_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotlight_item" ADD CONSTRAINT "spotlight_item_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_event" ADD CONSTRAINT "play_event_listenerId_fkey" FOREIGN KEY ("listenerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_event" ADD CONSTRAINT "play_event_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_event" ADD CONSTRAINT "play_event_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_daily_stat" ADD CONSTRAINT "track_daily_stat_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_daily_stat" ADD CONSTRAINT "user_daily_stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_member" ADD CONSTRAINT "conversation_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Hand-written constraints that Prisma's schema language cannot express (PRD section 16).
-- Prisma ignores CHECK constraints, so `prisma migrate diff` shows no drift for them.
-- ---------------------------------------------------------------------------------------------

-- Usernames are stored lowercase: 3-25 chars of [a-z0-9_-], starting with a letter or digit.
ALTER TABLE "user" ADD CONSTRAINT "user_username_format"
  CHECK ("username" ~ '^[a-z0-9][a-z0-9_-]{2,24}$');

ALTER TABLE "follow" ADD CONSTRAINT "follow_not_self"
  CHECK ("followerId" <> "followingId");

ALTER TABLE "block" ADD CONSTRAINT "block_not_self"
  CHECK ("blockerId" <> "blockedId");

-- Collections are PUBLIC or PRIVATE (only tracks can be scheduled), and every type except
-- PLAYLIST needs a release date.
ALTER TABLE "collection" ADD CONSTRAINT "collection_visibility_not_scheduled"
  CHECK ("visibility" IN ('PUBLIC', 'PRIVATE'));
ALTER TABLE "collection" ADD CONSTRAINT "collection_release_date_required"
  CHECK ("type" = 'PLAYLIST' OR "releaseDate" IS NOT NULL);

-- A scheduled track needs its publish time.
ALTER TABLE "track" ADD CONSTRAINT "track_scheduled_has_publish_at"
  CHECK ("visibility" <> 'SCHEDULED' OR "publishAt" IS NOT NULL);

-- A spotlight item points at exactly one thing.
ALTER TABLE "spotlight_item" ADD CONSTRAINT "spotlight_item_one_target"
  CHECK (("trackId" IS NULL) <> ("collectionId" IS NULL));

-- An activity row points at the thing its type says.
ALTER TABLE "activity" ADD CONSTRAINT "activity_target_matches_type"
  CHECK (
    ("type" IN ('TRACK_POSTED', 'TRACK_REPOSTED') AND "trackId" IS NOT NULL AND "collectionId" IS NULL)
    OR ("type" IN ('COLLECTION_POSTED', 'COLLECTION_REPOSTED') AND "collectionId" IS NOT NULL AND "trackId" IS NULL)
  );

-- Counters never go negative.
ALTER TABLE "track" ADD CONSTRAINT "track_counters_non_negative"
  CHECK ("playCount" >= 0 AND "likeCount" >= 0 AND "repostCount" >= 0 AND "commentCount" >= 0 AND "downloadCount" >= 0);
ALTER TABLE "collection" ADD CONSTRAINT "collection_counters_non_negative"
  CHECK ("likeCount" >= 0 AND "repostCount" >= 0 AND "playCount" >= 0 AND "trackCount" >= 0 AND "durationMs" >= 0);
ALTER TABLE "user" ADD CONSTRAINT "user_counters_non_negative"
  CHECK ("followerCount" >= 0 AND "followingCount" >= 0 AND "publicTrackCount" >= 0);
ALTER TABLE "comment" ADD CONSTRAINT "comment_like_count_non_negative" CHECK ("likeCount" >= 0);
