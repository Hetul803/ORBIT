ALTER TABLE "User" ADD COLUMN "signupIpHash" TEXT;

ALTER TABLE "Agent" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "Agent"
SET "onboardingCompletedAt" = CURRENT_TIMESTAMP
WHERE "name" <> 'Unnamed private agent';

ALTER TABLE "Connection"
ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN "syncProcessed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "syncTotal" INTEGER,
ADD COLUMN "syncStartedAt" TIMESTAMP(3);

ALTER TABLE "LifeItem" ADD COLUMN "copiedAt" TIMESTAMP(3);

CREATE INDEX "User_signupIpHash_createdAt_idx" ON "User"("signupIpHash", "createdAt");

CREATE TABLE "RedactionFailure" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "requestId" TEXT,

    CONSTRAINT "RedactionFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedactionFailure_conversationId_turnIndex_idx"
ON "RedactionFailure"("conversationId", "turnIndex");

CREATE INDEX "RedactionFailure_category_createdAt_idx"
ON "RedactionFailure"("category", "createdAt");

CREATE INDEX "RedactionFailure_requestId_idx" ON "RedactionFailure"("requestId");

ALTER TABLE "RedactionFailure"
ADD CONSTRAINT "RedactionFailure_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
