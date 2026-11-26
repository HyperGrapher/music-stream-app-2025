-- Admin-managed reserved usernames and visitor analytics.
CREATE TABLE "reserved_name" (
    "name" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reserved_name_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "page_view" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "browser" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_view_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_view_startedAt_idx" ON "page_view"("startedAt");
CREATE INDEX "page_view_lastSeenAt_idx" ON "page_view"("lastSeenAt");
CREATE INDEX "page_view_visitorId_startedAt_idx" ON "page_view"("visitorId", "startedAt");
CREATE INDEX "page_view_sessionId_startedAt_idx" ON "page_view"("sessionId", "startedAt");

ALTER TABLE "page_view" ADD CONSTRAINT "page_view_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
