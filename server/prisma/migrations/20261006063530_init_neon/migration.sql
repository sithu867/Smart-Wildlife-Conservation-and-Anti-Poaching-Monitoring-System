-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('LOCAL', 'PENDING', 'SYNCING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "PatrolStatus" AS ENUM ('ASSIGNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'MANUAL');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('SNARE', 'ANIMAL_CARCASS', 'ILLEGAL_CAMPSITE', 'AT_RISK_FOOTPRINTS', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertSource" AS ENUM ('COLLAR', 'COMMUNITY_REPORT');

-- CreateEnum
CREATE TYPE "ConflictAlertType" AS ENUM ('WILDLIFE_NEAR_COMMUNITY', 'WILDLIFE_NEAR_RANGER', 'CROP_RAID', 'LIVESTOCK_THREAT', 'DANGEROUS_WILDLIFE_ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResponseAction" AS ENUM ('INVESTIGATED_AREA', 'WARNED_COMMUNITY', 'REDIRECTED_WILDLIFE', 'CONTACTED_MANAGEMENT', 'MONITORED_WILDLIFE', 'SECURED_AREA', 'ESCALATED_SITUATION', 'OTHER');

-- CreateTable
CREATE TABLE "Park" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Park_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parkId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimatedDurationHours" DOUBLE PRECISION NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolAssignment" (
    "id" TEXT NOT NULL,
    "rangerId" TEXT NOT NULL,
    "rangerName" TEXT NOT NULL,
    "patrolRouteId" TEXT NOT NULL,
    "assignedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PatrolStatus" NOT NULL DEFAULT 'ASSIGNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolSession" (
    "id" TEXT NOT NULL,
    "clientSessionId" TEXT,
    "rangerId" TEXT NOT NULL,
    "rangerName" TEXT NOT NULL,
    "patrolAssignmentId" TEXT NOT NULL,
    "patrolRouteId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" "PatrolStatus" NOT NULL DEFAULT 'ACTIVE',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "totalDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waypoint" (
    "id" TEXT NOT NULL,
    "patrolSessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" "LocationSource" NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "Waypoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConservationIncident" (
    "id" TEXT NOT NULL,
    "clientIncidentId" TEXT,
    "incidentType" "IncidentType" NOT NULL,
    "otherTypeDescription" TEXT,
    "description" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "reportedBy" TEXT NOT NULL,
    "rangerName" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "patrolSessionId" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConservationIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentEvidence" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileSize" INTEGER,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',

    CONSTRAINT "IncidentEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WildlifeConflictAlert" (
    "id" TEXT NOT NULL,
    "clientAlertId" TEXT,
    "sourceEventId" TEXT,
    "source" "AlertSource" NOT NULL,
    "alertType" "ConflictAlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "location" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "animalId" TEXT,
    "reporterName" TEXT,
    "acknowledgedBy" TEXT,
    "clientAcknowledgementId" TEXT,
    "acknowledgedName" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "clientResolutionId" TEXT,
    "resolvedName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WildlifeConflictAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictResponse" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "clientResponseId" TEXT,
    "responderId" TEXT NOT NULL,
    "responderName" TEXT NOT NULL,
    "action" "ResponseAction" NOT NULL,
    "notes" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,

    CONSTRAINT "ConflictResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Park_code_key" ON "Park"("code");

-- CreateIndex
CREATE INDEX "PatrolRoute_parkId_idx" ON "PatrolRoute"("parkId");

-- CreateIndex
CREATE INDEX "PatrolAssignment_rangerId_idx" ON "PatrolAssignment"("rangerId");

-- CreateIndex
CREATE INDEX "PatrolAssignment_status_idx" ON "PatrolAssignment"("status");

-- CreateIndex
CREATE INDEX "PatrolSession_clientSessionId_idx" ON "PatrolSession"("clientSessionId");

-- CreateIndex
CREATE INDEX "PatrolSession_rangerId_idx" ON "PatrolSession"("rangerId");

-- CreateIndex
CREATE INDEX "PatrolSession_status_idx" ON "PatrolSession"("status");

-- CreateIndex
CREATE INDEX "PatrolSession_patrolRouteId_idx" ON "PatrolSession"("patrolRouteId");

-- CreateIndex
CREATE INDEX "Waypoint_patrolSessionId_timestamp_idx" ON "Waypoint"("patrolSessionId", "timestamp");

-- CreateIndex
CREATE INDEX "ConservationIncident_clientIncidentId_idx" ON "ConservationIncident"("clientIncidentId");

-- CreateIndex
CREATE INDEX "ConservationIncident_reportedBy_idx" ON "ConservationIncident"("reportedBy");

-- CreateIndex
CREATE INDEX "ConservationIncident_reportedAt_idx" ON "ConservationIncident"("reportedAt");

-- CreateIndex
CREATE INDEX "ConservationIncident_patrolSessionId_idx" ON "ConservationIncident"("patrolSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentEvidence_evidenceId_key" ON "IncidentEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "IncidentEvidence_incidentId_idx" ON "IncidentEvidence"("incidentId");

-- CreateIndex
CREATE INDEX "WildlifeConflictAlert_clientAlertId_idx" ON "WildlifeConflictAlert"("clientAlertId");

-- CreateIndex
CREATE INDEX "WildlifeConflictAlert_sourceEventId_idx" ON "WildlifeConflictAlert"("sourceEventId");

-- CreateIndex
CREATE INDEX "WildlifeConflictAlert_status_severity_createdAt_idx" ON "WildlifeConflictAlert"("status", "severity", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConflictResponse_responseId_key" ON "ConflictResponse"("responseId");

-- CreateIndex
CREATE INDEX "ConflictResponse_alertId_respondedAt_idx" ON "ConflictResponse"("alertId", "respondedAt");

-- AddForeignKey
ALTER TABLE "PatrolRoute" ADD CONSTRAINT "PatrolRoute_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_patrolRouteId_fkey" FOREIGN KEY ("patrolRouteId") REFERENCES "PatrolRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_patrolAssignmentId_fkey" FOREIGN KEY ("patrolAssignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_patrolRouteId_fkey" FOREIGN KEY ("patrolRouteId") REFERENCES "PatrolRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waypoint" ADD CONSTRAINT "Waypoint_patrolSessionId_fkey" FOREIGN KEY ("patrolSessionId") REFERENCES "PatrolSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConservationIncident" ADD CONSTRAINT "ConservationIncident_patrolSessionId_fkey" FOREIGN KEY ("patrolSessionId") REFERENCES "PatrolSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentEvidence" ADD CONSTRAINT "IncidentEvidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ConservationIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictResponse" ADD CONSTRAINT "ConflictResponse_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "WildlifeConflictAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;
