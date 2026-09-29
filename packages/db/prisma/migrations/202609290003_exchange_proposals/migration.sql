CREATE TABLE "ExchangeProposal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "haveItemId" TEXT NOT NULL,
    "wantItemId" TEXT NOT NULL,
    "conversationId" TEXT,
    "terms" JSONB NOT NULL,
    "userADecision" "RevealDecision" NOT NULL DEFAULT 'PENDING',
    "userBDecision" "RevealDecision" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExchangeProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExchangeProposal_haveItemId_wantItemId_key" ON "ExchangeProposal"("haveItemId", "wantItemId");
CREATE INDEX "ExchangeProposal_haveItemId_idx" ON "ExchangeProposal"("haveItemId");
CREATE INDEX "ExchangeProposal_wantItemId_idx" ON "ExchangeProposal"("wantItemId");
CREATE INDEX "ExchangeProposal_acceptedAt_idx" ON "ExchangeProposal"("acceptedAt");
CREATE INDEX "ExchangeProposal_expiresAt_idx" ON "ExchangeProposal"("expiresAt");

ALTER TABLE "ExchangeProposal" ADD CONSTRAINT "ExchangeProposal_haveItemId_fkey" FOREIGN KEY ("haveItemId") REFERENCES "ExchangeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExchangeProposal" ADD CONSTRAINT "ExchangeProposal_wantItemId_fkey" FOREIGN KEY ("wantItemId") REFERENCES "ExchangeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
