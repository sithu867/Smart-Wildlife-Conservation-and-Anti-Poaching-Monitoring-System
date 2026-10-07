BEGIN;

CREATE TABLE "StatisticalReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "parkId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "criteria" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "creatorId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentReportId" TEXT,
    CONSTRAINT "StatisticalReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StatisticalReport_parentReportId_version_key" ON "StatisticalReport"("parentReportId", "version");
CREATE INDEX "StatisticalReport_archivedAt_createdAt_id_idx" ON "StatisticalReport"("archivedAt", "createdAt", "id");
CREATE INDEX "StatisticalReport_parkId_idx" ON "StatisticalReport"("parkId");
ALTER TABLE "StatisticalReport" ADD CONSTRAINT "StatisticalReport_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatisticalReport" ADD CONSTRAINT "StatisticalReport_parentReportId_fkey" FOREIGN KEY ("parentReportId") REFERENCES "StatisticalReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
