-- Gmail and Google Calendar records retained with source links so every one-user
-- insight can cite the exact data it came from.
CREATE TYPE "SourceDocumentKind" AS ENUM ('GMAIL_MESSAGE', 'GOOGLE_CALENDAR_EVENT');
CREATE TYPE "SourceDocumentDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'UNKNOWN');
CREATE TYPE "LifeItemKind" AS ENUM ('CATCH', 'NUDGE', 'DRAFT');
CREATE TYPE "LifeItemStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'SNOOZED', 'COMPLETED');

CREATE TABLE "SourceDocument" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL,
  "kind" "SourceDocumentKind" NOT NULL,
  "direction" "SourceDocumentDirection" NOT NULL DEFAULT 'UNKNOWN',
  "externalId" TEXT NOT NULL,
  "threadId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "sender" TEXT,
  "recipients" TEXT,
  "occurredAt" TIMESTAMP(3),
  "body" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifeItem" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL,
  "kind" "LifeItemKind" NOT NULL,
  "status" "LifeItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "stableKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "dueAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),
  "draft" TEXT,
  CONSTRAINT "LifeItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceDocument_userId_kind_externalId_key" ON "SourceDocument"("userId", "kind", "externalId");
CREATE INDEX "SourceDocument_userId_kind_occurredAt_idx" ON "SourceDocument"("userId", "kind", "occurredAt");
CREATE INDEX "SourceDocument_userId_threadId_idx" ON "SourceDocument"("userId", "threadId");
CREATE INDEX "SourceDocument_userId_direction_occurredAt_idx" ON "SourceDocument"("userId", "direction", "occurredAt");
CREATE UNIQUE INDEX "LifeItem_userId_stableKey_key" ON "LifeItem"("userId", "stableKey");
CREATE INDEX "LifeItem_userId_status_dueAt_idx" ON "LifeItem"("userId", "status", "dueAt");
CREATE INDEX "LifeItem_userId_kind_createdAt_idx" ON "LifeItem"("userId", "kind", "createdAt");

ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifeItem" ADD CONSTRAINT "LifeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
