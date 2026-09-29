CREATE TABLE "AgeGateAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "emailHash" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "AgeGateAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgeGateAttempt_emailHash_createdAt_idx" ON "AgeGateAttempt"("emailHash", "createdAt");
CREATE INDEX "AgeGateAttempt_allowed_createdAt_idx" ON "AgeGateAttempt"("allowed", "createdAt");
