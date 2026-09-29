CREATE TABLE "Mute" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "muterUserId" TEXT NOT NULL,
    "mutedUserId" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "Mute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mute_muterUserId_mutedUserId_key" ON "Mute"("muterUserId", "mutedUserId");
CREATE INDEX "Mute_muterUserId_idx" ON "Mute"("muterUserId");
CREATE INDEX "Mute_mutedUserId_idx" ON "Mute"("mutedUserId");
CREATE INDEX "Mute_expiresAt_idx" ON "Mute"("expiresAt");

ALTER TABLE "Mute" ADD CONSTRAINT "Mute_muterUserId_fkey" FOREIGN KEY ("muterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mute" ADD CONSTRAINT "Mute_mutedUserId_fkey" FOREIGN KEY ("mutedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
