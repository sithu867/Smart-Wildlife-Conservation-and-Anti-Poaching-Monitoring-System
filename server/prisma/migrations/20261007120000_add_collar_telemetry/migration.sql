CREATE TABLE "CollarTelemetry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "batteryPercent" INTEGER,
    "accuracyMeters" DOUBLE PRECISION,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertCreated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CollarTelemetry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollarTelemetry_eventId_key" ON "CollarTelemetry"("eventId");
CREATE INDEX "CollarTelemetry_deviceId_recordedAt_idx" ON "CollarTelemetry"("deviceId", "recordedAt");
CREATE INDEX "CollarTelemetry_animalId_recordedAt_idx" ON "CollarTelemetry"("animalId", "recordedAt");
