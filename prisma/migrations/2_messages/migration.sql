-- Direct messages (PRD 13.3). No code created conversations before this migration, so the table is empty.
DELETE FROM "conversation";

ALTER TABLE "conversation" ADD COLUMN "pairKey" TEXT NOT NULL,
ADD COLUMN "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "conversation_pairKey_key" ON "conversation"("pairKey");

ALTER TABLE "message" ADD COLUMN "removedAt" TIMESTAMP(3);
