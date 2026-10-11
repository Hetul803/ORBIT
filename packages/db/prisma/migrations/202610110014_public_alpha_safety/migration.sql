ALTER TABLE "AgentConversation" ADD COLUMN "suppressedAt" TIMESTAMP(3);
UPDATE "AgentConversation" SET "suppressedAt" = CURRENT_TIMESTAMP WHERE "status" = 'MODERATION_FLAGGED';
ALTER TABLE "Report" ADD COLUMN "acknowledgedAt" TIMESTAMP(3), ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Connection" ADD COLUMN "expiredAt" TIMESTAMP(3), ADD COLUMN "reconnectPromptedAt" TIMESTAMP(3);
UPDATE "Connection" SET "expiredAt" = "updatedAt" WHERE "status" = 'EXPIRED';

-- A block has no expiry or soft-unblock path in this alpha. Restore old soft-deleted blocks.
UPDATE "Block" SET "deletedAt" = NULL WHERE "deletedAt" IS NOT NULL;
ALTER TABLE "Block" ADD CONSTRAINT "Block_no_soft_unblock" CHECK ("deletedAt" IS NULL);
UPDATE "AgentConversation" c SET "suppressedAt" = COALESCE(c."suppressedAt", CURRENT_TIMESTAMP)
FROM "Agent" a, "Agent" b
WHERE c."agentAId" = a.id AND c."agentBId" = b.id AND EXISTS (
  SELECT 1 FROM "Block" block WHERE
  (block."blockerUserId" = a."userId" AND block."blockedUserId" = b."userId") OR
  (block."blockerUserId" = b."userId" AND block."blockedUserId" = a."userId")
);

CREATE TABLE "ModerationAlert" (
  "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "reportId" TEXT NOT NULL, "channel" TEXT NOT NULL,
  "recipientKey" TEXT NOT NULL, "recipientEmail" TEXT, "operatorUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3), "lastError" TEXT,
  CONSTRAINT "ModerationAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModerationAlert_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ModerationAlert_reportId_channel_recipientKey_key" ON "ModerationAlert"("reportId", "channel", "recipientKey");
CREATE INDEX "ModerationAlert_status_nextAttemptAt_idx" ON "ModerationAlert"("status", "nextAttemptAt");
CREATE TABLE "WaitlistEntry" (
  "id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'verified_otp',
  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
