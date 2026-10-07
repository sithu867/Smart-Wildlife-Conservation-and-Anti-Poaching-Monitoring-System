import { prisma } from '../config/prisma.js';

async function main() {
  console.log('Checking database table CollarTelemetry...');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CollarTelemetry" (
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
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "CollarTelemetry_eventId_key" ON "CollarTelemetry"("eventId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CollarTelemetry_deviceId_recordedAt_idx" ON "CollarTelemetry"("deviceId", "recordedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CollarTelemetry_animalId_recordedAt_idx" ON "CollarTelemetry"("animalId", "recordedAt");
  `);

  console.log('CollarTelemetry table & indexes created or verified.');

  const count = await prisma.collarTelemetry.count();
  console.log(`CollarTelemetry verification succeeded! Current records count: ${count}`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
