CREATE TYPE "ProfileLayer" AS ENUM ('IDENTITY', 'PREFERENCES', 'RELATIONSHIPS', 'JUDGMENT', 'STATE');
CREATE TYPE "ProfileFactState" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "ProactiveProposalType" AS ENUM ('APPROACHING_COMMITMENT', 'UNANSWERED_MESSAGE', 'CALENDAR_CONFLICT', 'WATCHER_HIT', 'STALE_PROJECT', 'PATTERN', 'RECURRING_TASK');
CREATE TYPE "ProactiveAutonomyLevel" AS ENUM ('OBSERVE', 'PROPOSE', 'ACT');
CREATE TYPE "ProactiveProposalStatus" AS ENUM ('OBSERVED', 'PROPOSED', 'ACCEPTED', 'DISMISSED', 'ACTED', 'SNOOZED', 'EXPIRED');

ALTER TABLE "MemoryFact"
  ADD COLUMN "profileLayer" "ProfileLayer" NOT NULL DEFAULT 'PREFERENCES',
  ADD COLUMN "state" "ProfileFactState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "canonicalKey" TEXT,
  ADD COLUMN "sourceRef" TEXT,
  ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "expiryPolicy" TEXT NOT NULL DEFAULT 'never',
  ADD COLUMN "observationCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "MemoryFact"
SET "profileLayer" = CASE
  WHEN "kind" = 'PERSON' THEN 'RELATIONSHIPS'::"ProfileLayer"
  WHEN "kind" = 'EVENT' THEN 'STATE'::"ProfileLayer"
  ELSE 'PREFERENCES'::"ProfileLayer"
END;

CREATE TABLE "ProfileFactReceipt" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "factId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previous" JSONB,
  "next" JSONB,
  CONSTRAINT "ProfileFactReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProactivePolicy" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ProactiveProposalType" NOT NULL,
  "level" "ProactiveAutonomyLevel" NOT NULL DEFAULT 'PROPOSE',
  "consecutiveAccepts" INTEGER NOT NULL DEFAULT 0,
  "consecutiveDismissals" INTEGER NOT NULL DEFAULT 0,
  "promotionOfferedAt" TIMESTAMP(3),
  "lastChangedReason" TEXT,
  CONSTRAINT "ProactivePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProactiveProposal" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "policyId" TEXT,
  "type" "ProactiveProposalType" NOT NULL,
  "level" "ProactiveAutonomyLevel" NOT NULL,
  "status" "ProactiveProposalStatus" NOT NULL,
  "stableKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "reason" JSONB NOT NULL,
  "reversible" BOOLEAN NOT NULL DEFAULT true,
  "touchesOthers" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" TIMESTAMP(3),
  "actedAt" TIMESTAMP(3),
  CONSTRAINT "ProactiveProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemoryFact_agentId_profileLayer_state_idx" ON "MemoryFact"("agentId", "profileLayer", "state");
CREATE INDEX "MemoryFact_agentId_canonicalKey_idx" ON "MemoryFact"("agentId", "canonicalKey");
CREATE INDEX "MemoryFact_expiresAt_idx" ON "MemoryFact"("expiresAt");
CREATE INDEX "ProfileFactReceipt_factId_createdAt_idx" ON "ProfileFactReceipt"("factId", "createdAt");
CREATE UNIQUE INDEX "ProactivePolicy_userId_type_key" ON "ProactivePolicy"("userId", "type");
CREATE INDEX "ProactivePolicy_userId_level_idx" ON "ProactivePolicy"("userId", "level");
CREATE UNIQUE INDEX "ProactiveProposal_userId_stableKey_key" ON "ProactiveProposal"("userId", "stableKey");
CREATE INDEX "ProactiveProposal_userId_status_createdAt_idx" ON "ProactiveProposal"("userId", "status", "createdAt");
CREATE INDEX "ProactiveProposal_policyId_idx" ON "ProactiveProposal"("policyId");
CREATE INDEX "ProactiveProposal_dueAt_idx" ON "ProactiveProposal"("dueAt");

ALTER TABLE "ProfileFactReceipt" ADD CONSTRAINT "ProfileFactReceipt_factId_fkey" FOREIGN KEY ("factId") REFERENCES "MemoryFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProactivePolicy" ADD CONSTRAINT "ProactivePolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProactiveProposal" ADD CONSTRAINT "ProactiveProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProactiveProposal" ADD CONSTRAINT "ProactiveProposal_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ProactivePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
