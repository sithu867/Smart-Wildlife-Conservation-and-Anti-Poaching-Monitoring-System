import { jest } from '@jest/globals';

// Mock only the Prisma boundary used by the UC-A patrol module; the service logic stays real.
// Rows are plain objects shaped like the Prisma models the service reads.
type Row = Record<string, any>;
const fn = () => jest.fn<(args?: any) => Promise<any>>();

export const prisma = {
  $executeRawUnsafe: jest.fn<(sql: string) => Promise<number>>(),
  $transaction: jest.fn<(callback: (tx: unknown) => Promise<unknown>) => Promise<unknown>>(),
  park: { upsert: fn() },
  patrolRoute: { findFirst: fn(), findUnique: fn(), create: fn() },
  patrolAssignment: {
    findFirst: fn(),
    findUnique: fn(),
    create: fn(),
    update: fn(),
    updateMany: fn(),
    deleteMany: fn()
  },
  patrolSession: {
    count: fn(),
    findFirst: fn(),
    findUnique: fn(),
    findMany: fn(),
    create: fn(),
    update: fn(),
    updateMany: fn()
  },
  waypoint: { create: fn(), deleteMany: fn() }
};

jest.unstable_mockModule('../src/config/prisma.js', () => ({ prisma }));

export const park: Row = { id: 'park-1', name: 'Yala National Park (Ruhuna)', code: 'YALA-NP' };
export const route: Row = { id: 'route-1', parkId: 'park-1', name: 'Udawalawe Reservoir Elephant Patrol', park };

export function resetPatrolPrisma() {
  for (const model of Object.values(prisma)) {
    if (typeof model === 'function') model.mockReset();
    else for (const method of Object.values(model)) method.mockReset();
  }
  // Transactions run their callback against the same mocked client.
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  prisma.$executeRawUnsafe.mockResolvedValue(0);
}

/**
 * Configures the demo seeding performed by ensureSeedData(): the ranger already has patrol history,
 * the seeded route exists, and `assignment` (or a newly created one) is the ranger's assignment.
 */
export function mockSeededRanger(options: { assignment?: Row | null; activeSession?: Row | null; createdAssignment?: Row | null } = {}) {
  prisma.park.upsert.mockResolvedValue(park);
  prisma.patrolRoute.findFirst.mockResolvedValue(route);
  prisma.patrolSession.count.mockResolvedValue(1);
  prisma.patrolSession.findFirst.mockResolvedValue(options.activeSession ?? null);
  prisma.patrolAssignment.deleteMany.mockResolvedValue({ count: 0 });
  prisma.patrolAssignment.updateMany.mockResolvedValue({ count: 0 });
  prisma.patrolAssignment.findFirst.mockResolvedValue(options.assignment ?? null);
  if (options.createdAssignment !== undefined) prisma.patrolAssignment.create.mockResolvedValue(options.createdAssignment);
}
