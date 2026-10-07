import { jest } from '@jest/globals';
import type { Prisma } from '@prisma/client';
import type { ParkOption } from '../src/modules/analytics/contract.js';

// Mock only Prisma's read boundary; HTTP validation and UC-D calculations stay real.
// Partial projections mirror exactly the fields the analytics queries consume.
interface SessionRow {
  id: string;
  patrolRouteId?: string;
  startTime?: Date | string;
  endTime?: Date | string | null;
  status?: string;
  rangerName?: string;
  waypoints?: unknown;
}
interface IncidentRow {
  incidentType: string;
  status: string;
  reportedAt: Date;
  location: unknown;
}
interface AlertRow {
  location?: unknown;
  createdAt?: Date;
  severity?: string;
  status?: string;
  source?: string;
  alertType?: string;
  responses?: Array<{ action: string; respondedAt: Date }>;
}
export const prisma = {
  park: {
    findUnique:
      jest.fn<
        (args: Prisma.ParkFindUniqueArgs) => Promise<ParkOption | null>
      >(),
    findMany:
      jest.fn<(args: Prisma.ParkFindManyArgs) => Promise<ParkOption[]>>(),
  },
  patrolRoute: {
    findMany:
      jest.fn<
        (
          args: Prisma.PatrolRouteFindManyArgs,
        ) => Promise<Array<{ id: string; name?: string; geometry?: unknown }>>
      >(),
  },
  patrolSession: {
    findMany:
      jest.fn<
        (args: Prisma.PatrolSessionFindManyArgs) => Promise<SessionRow[]>
      >(),
  },
  conservationIncident: {
    findMany:
      jest.fn<
        (
          args: Prisma.ConservationIncidentFindManyArgs,
        ) => Promise<IncidentRow[]>
      >(),
  },
  wildlifeConflictAlert: {
    findMany:
      jest.fn<
        (args: Prisma.WildlifeConflictAlertFindManyArgs) => Promise<AlertRow[]>
      >(),
  },
};

jest.unstable_mockModule('../src/config/prisma.js', () => ({ prisma }));

export function resetAnalyticsPrisma() {
  for (const model of Object.values(prisma))
    for (const method of Object.values(model)) method.mockReset();
}
