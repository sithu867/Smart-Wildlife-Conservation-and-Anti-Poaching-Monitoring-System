BEGIN;

-- Nullable references preserve old clients and every existing record.
ALTER TABLE "ConservationIncident" ADD COLUMN "parkId" TEXT;
ALTER TABLE "WildlifeConflictAlert" ADD COLUMN "parkId" TEXT;

CREATE INDEX "ConservationIncident_parkId_reportedAt_idx" ON "ConservationIncident"("parkId", "reportedAt");
CREATE INDEX "WildlifeConflictAlert_parkId_createdAt_idx" ON "WildlifeConflictAlert"("parkId", "createdAt");
ALTER TABLE "ConservationIncident" ADD CONSTRAINT "ConservationIncident_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WildlifeConflictAlert" ADD CONSTRAINT "WildlifeConflictAlert_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Only the stored session -> route -> park relationship is trustworthy enough
-- to backfill. Standalone incidents and legacy alerts stay unassigned.
UPDATE "ConservationIncident" AS incident
SET "parkId" = route."parkId"
FROM "PatrolSession" AS session
JOIN "PatrolRoute" AS route ON route."id" = session."patrolRouteId"
WHERE incident."patrolSessionId" = session."id" AND incident."parkId" IS NULL;

COMMIT;
