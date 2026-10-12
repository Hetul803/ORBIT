ALTER TABLE "Connection"
ADD COLUMN "syncRunId" TEXT,
ADD COLUMN "syncState" JSONB,
ADD COLUMN "syncLeaseToken" TEXT,
ADD COLUMN "syncLeaseUntil" TIMESTAMP(3),
ADD COLUMN "syncNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "syncErrorCode" TEXT;

CREATE INDEX "Connection_syncStatus_syncNextAttemptAt_idx" ON "Connection"("syncStatus", "syncNextAttemptAt");
