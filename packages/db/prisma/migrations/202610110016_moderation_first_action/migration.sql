ALTER TABLE "Report" ADD COLUMN "firstActionAt" TIMESTAMP(3);
-- Preserve prior closure evidence without inventing an earlier first-action timestamp.
UPDATE "Report" SET "firstActionAt" = "resolvedAt" WHERE "resolvedAt" IS NOT NULL;
