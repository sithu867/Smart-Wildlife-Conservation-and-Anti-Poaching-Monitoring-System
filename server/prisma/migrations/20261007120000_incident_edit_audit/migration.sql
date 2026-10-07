-- AlterTable
ALTER TABLE "ConservationIncident" ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastEditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IncidentEvidence" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IncidentRevision" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "clientEditId" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editedByName" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "IncidentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentRevision_incidentId_receivedAt_idx" ON "IncidentRevision"("incidentId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentRevision_incidentId_clientEditId_key" ON "IncidentRevision"("incidentId", "clientEditId");

-- AddForeignKey
ALTER TABLE "IncidentRevision" ADD CONSTRAINT "IncidentRevision_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConservationIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
