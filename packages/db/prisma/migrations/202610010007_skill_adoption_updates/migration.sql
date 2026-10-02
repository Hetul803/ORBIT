ALTER TABLE "SkillAdoption"
ADD COLUMN "adoptedVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "pendingDefinition" JSONB,
ADD COLUMN "pendingVersion" INTEGER;
