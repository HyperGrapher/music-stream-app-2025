-- AlterTable
ALTER TABLE "play_event" ADD COLUMN     "clientHash" TEXT;

-- CreateIndex
CREATE INDEX "play_event_trackId_clientHash_createdAt_idx" ON "play_event"("trackId", "clientHash", "createdAt");
