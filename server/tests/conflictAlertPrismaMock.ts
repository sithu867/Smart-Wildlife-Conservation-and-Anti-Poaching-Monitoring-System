import { jest } from '@jest/globals';

// Mock only the Prisma boundary used by the UC-C conflict-alert and collar-ingestion modules;
// the service logic stays real.
const fn = () => jest.fn<(args?: any) => Promise<any>>();

export const prisma = {
  park: { findUnique: fn() },
  wildlifeConflictAlert: { findFirst: fn(), findMany: fn(), create: fn(), update: fn() },
  conflictAuditEntry: { create: fn(), findMany: fn() },
  conflictResponse: { findFirst: fn(), update: fn() },
  collarTelemetry: { findUnique: fn(), findMany: fn(), create: fn(), update: fn() }
};

jest.unstable_mockModule('../src/config/prisma.js', () => ({ prisma }));

export function resetConflictPrisma() {
  for (const model of Object.values(prisma)) for (const method of Object.values(model)) method.mockReset();
  // Defaults: no existing alert or telemetry, audit writes succeed.
  prisma.wildlifeConflictAlert.findFirst.mockResolvedValue(null);
  prisma.wildlifeConflictAlert.findMany.mockResolvedValue([]);
  prisma.conflictAuditEntry.create.mockResolvedValue({});
  prisma.collarTelemetry.findUnique.mockResolvedValue(null);
  prisma.collarTelemetry.update.mockResolvedValue({});
}
