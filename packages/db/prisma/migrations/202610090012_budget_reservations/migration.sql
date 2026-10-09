CREATE TABLE "ModelBudgetReservation" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "costCents" DECIMAL(14,6) NOT NULL,
  CONSTRAINT "ModelBudgetReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelBudgetReservation_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ModelBudgetReservation_userId_createdAt_idx" ON "ModelBudgetReservation"("userId", "createdAt");
CREATE INDEX "ModelBudgetReservation_createdAt_idx" ON "ModelBudgetReservation"("createdAt");

-- Remove Gmail body/snippet retention from records written by an earlier beta.
UPDATE "SourceDocument"
SET "body" = '', "metadata" = "metadata" - 'snippet'
WHERE "kind" = 'GMAIL_MESSAGE';
UPDATE "InboxItem"
SET "body" = 'Open the original email to read it. ORBIT does not retain Gmail message bodies.', "agentReply" = NULL
WHERE "kind" LIKE 'gmail:%';
