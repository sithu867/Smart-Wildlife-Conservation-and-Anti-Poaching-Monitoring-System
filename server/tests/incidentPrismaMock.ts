import { jest } from '@jest/globals';

// Mock only the Prisma boundary used by the UC-B incident module; the service logic stays real.
const fn = () => jest.fn<(args?: any) => Promise<any>>();

export const prisma = {
  $transaction: jest.fn<(callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>>(),
  $executeRaw: jest.fn<(...args: unknown[]) => Promise<number>>(),
  park: { findUnique: fn() },
  patrolSession: { findFirst: fn(), findUnique: fn() },
  conservationIncident: { findFirst: fn(), findUnique: fn(), findMany: fn(), create: fn(), updateMany: fn() },
  incidentEvidence: { updateMany: fn(), createMany: fn() },
  incidentRevision: { findUnique: fn(), create: fn() }
};

jest.unstable_mockModule('../src/config/prisma.js', () => ({ prisma }));

export function resetIncidentPrisma() {
  for (const model of Object.values(prisma)) {
    if (typeof model === 'function') model.mockReset();
    else for (const method of Object.values(model)) method.mockReset();
  }
  // Transactions run their callback against the same mocked client.
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  prisma.$executeRaw.mockResolvedValue(1);
  // Defaults: no patrol covers the report, no retried edit, writes affect one row.
  prisma.patrolSession.findFirst.mockResolvedValue(null);
  prisma.incidentRevision.findUnique.mockResolvedValue(null);
  prisma.incidentRevision.create.mockResolvedValue({});
  prisma.conservationIncident.updateMany.mockResolvedValue({ count: 1 });
  prisma.incidentEvidence.updateMany.mockResolvedValue({ count: 1 });
  prisma.incidentEvidence.createMany.mockResolvedValue({ count: 1 });
}
