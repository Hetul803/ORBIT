-- Preserve existing account IDs, token ciphertext and source IDs. No data is deleted.
ALTER TABLE "Connection" ADD COLUMN "accountKey" TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE "Connection" ADD COLUMN "accountEmail" TEXT;
UPDATE "Connection" SET "accountEmail" = NULLIF("syncState"->>'accountEmail', '') WHERE "provider" = 'GOOGLE';
DROP INDEX "Connection_userId_provider_key";
CREATE UNIQUE INDEX "Connection_userId_provider_accountKey_key" ON "Connection"("userId", "provider", "accountKey");
ALTER TABLE "OtpChallenge" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "SourceDocument" ADD COLUMN "connectionId" TEXT;
UPDATE "SourceDocument" s SET "connectionId" = c."id" FROM "Connection" c
WHERE s."userId" = c."userId" AND c."provider" = 'GOOGLE'
AND s."kind" IN ('GMAIL_MESSAGE', 'GOOGLE_CALENDAR_EVENT');
CREATE INDEX "SourceDocument_connectionId_idx" ON "SourceDocument"("connectionId");
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
