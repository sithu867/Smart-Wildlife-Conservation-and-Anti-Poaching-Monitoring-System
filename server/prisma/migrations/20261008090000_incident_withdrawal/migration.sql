-- CreateEnum
CREATE TYPE "IncidentDeletionReason" AS ENUM ('DUPLICATE', 'CREATED_BY_MISTAKE', 'FALSE_ALARM', 'OTHER');

-- AlterTable
ALTER TABLE "ConservationIncident" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "deletionNote" TEXT,
ADD COLUMN     "deletionReason" "IncidentDeletionReason";

-- AlterTable
ALTER TABLE "IncidentRevision" ADD COLUMN     "action" TEXT NOT NULL DEFAULT 'EDIT';

-- CreateIndex
CREATE INDEX "ConservationIncident_reportedBy_deletedAt_idx" ON "ConservationIncident"("reportedBy", "deletedAt");
