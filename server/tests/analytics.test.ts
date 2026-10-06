import { jest } from '@jest/globals';
import request from 'supertest';
import {
  IncidentType,
  IncidentStatus,
  AlertSeverity,
  AlertStatus,
  AlertSource,
  ConflictAlertType,
} from '@prisma/client';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';
const { createApp } = await import('../src/app.js');
const { analyticsService } =
  await import('../src/modules/analytics/service.js');
import { analysisCriteriaSchema } from '../src/modules/analytics/validation.js';
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';

const app = createApp();
const parkId = 'c67a000000000000000000001';
const routeId = 'c67a000000000000000000002';
const sessionId = 'c67a000000000000000000004';
const criteria: AnalysisCriteria = {
  parkId,
  start: '2026-09-01',
  end: '2026-09-30',
  categories: ['INCIDENT_STATISTICS'],
};
const park = {
  id: parkId,
  name: 'Real database park',
  code: 'REAL',
};

// Mock only the database boundary. HTTP parsing, Zod, controllers and UC-D
// business logic remain real, including the single-category query encoding.
function analyzeQuery(overrides: Record<string, unknown> = {}) {
  return request(app)
    .get('/api/analytics')
    .set('x-user-role', 'MANAGER')
    .query({
      parkId,
      start: criteria.start,
      end: criteria.end,
      'categories[]': criteria.categories,
      ...overrides,
    });
}

beforeEach(() => {
  resetAnalyticsPrisma();
  jest.mocked(prisma.wildlifeConflictAlert.findMany).mockResolvedValue([]);
  jest.mocked(prisma.park.findUnique).mockResolvedValue(park);
  jest.mocked(prisma.patrolRoute.findMany).mockResolvedValue([{ id: routeId }]);
  jest.mocked(prisma.patrolSession.findMany).mockResolvedValue([
    {
      id: sessionId,
      patrolRouteId: routeId,
      startTime: new Date('2026-09-02'),
      status: 'COMPLETED',
      rangerName: 'Ranger',
    },
  ]);
  jest.mocked(prisma.conservationIncident.findMany).mockResolvedValue([
    {
      incidentType: 'SNARE',
      status: 'REPORTED',
      reportedAt: new Date('2026-09-02'),
      location: { latitude: -2.1523, longitude: 34.8214 },
    },
  ]);
});
afterEach(() => jest.restoreAllMocks());

describe('UC-D Batch 1 criteria contract', () => {
  test('supported filter values match the generated Prisma enums', () => {
    for (const [field, values] of Object.entries({
      incidentType: IncidentType,
      incidentStatus: IncidentStatus,
      severity: AlertSeverity,
      conflictStatus: AlertStatus,
      conflictSource: AlertSource,
      conflictType: ConflictAlertType,
    })) {
      for (const value of Object.values(values))
        expect(
          analysisCriteriaSchema.safeParse({ ...criteria, [field]: value })
            .success,
        ).toBe(true);
    }
  });
  test('accepts a current CUID containing letters beyond hexadecimal', () => {
    expect(
      analysisCriteriaSchema.safeParse({
        ...criteria,
        parkId: 'cmfrg6vkp0000qj04j5a6j8s1',
      }).success,
    ).toBe(true);
  });
  test('accepts valid criteria and deduplicates categories', () => {
    expect(
      analysisCriteriaSchema.parse({
        ...criteria,
        categories: ['INCIDENT_STATISTICS', 'INCIDENT_STATISTICS'],
      }),
    ).toEqual(criteria);
  });
  test.each([
    ['reversed dates', { start: '2026-10-01' }],
    ['missing start', { start: undefined }],
    ['missing end', { end: undefined }],
    ['invalid date', { start: 'not-a-date' }],
    ['impossible calendar date', { start: '2026-02-30' }],
    ['no categories', { categories: [] }],
    ['missing categories', { categories: undefined }],
    ['unsupported category', { categories: ['UNSUPPORTED'] }],
    ['malformed categories', { categories: { key: 'INCIDENT_STATISTICS' } }],
    ['invalid park', { parkId: 'invalid' }],
    ['old ObjectID', { parkId: '67a000000000000000000001' }],
    ['blank park', { parkId: '' }],
    ['non-string park', { parkId: 123 }],
    ['missing park', { parkId: undefined }],
    ['unsupported field', { unexpected: 'value' }],
    ['invalid optional filter', { severity: 'EXTREME' }],
  ])('rejects %s independently of the frontend', (_name, overrides) => {
    expect(
      analysisCriteriaSchema.safeParse({ ...criteria, ...overrides }).success,
    ).toBe(false);
  });
  test('accepts a same-day range', () => {
    expect(
      analysisCriteriaSchema.safeParse({ ...criteria, end: criteria.start })
        .success,
    ).toBe(true);
  });
  test.each([
    ['incidentType', 'POACHING'],
    ['incidentStatus', 'CLOSED'],
    ['severity', 'EXTREME'],
    ['conflictStatus', 'CLOSED'],
    ['conflictSource', 'RANGER'],
    ['conflictType', 'POACHING'],
    ['rangerId', '   '],
    ['rangerId', 'R\n101'],
    ['severity', false],
    ['conflictSource', null],
    ['incidentType[]', ['SNARE']],
  ])(
    'rejects malformed %s at the API before querying any data',
    async (field, value) => {
      const response = await analyzeQuery({ [field]: value });
      expect(response.status).toBe(400);
      expect(response.body.error.message).not.toContain('Invalid enum');
      expect(prisma.park.findUnique).not.toHaveBeenCalled();
    },
  );
  test('rejects non-string Ranger IDs before HTTP serialization', () => {
    expect(
      analysisCriteriaSchema.safeParse({ ...criteria, rangerId: 123 }).success,
    ).toBe(false);
  });
  test('accepts every supported optional filter and normalizes Ranger ID', () => {
    const parsed = analysisCriteriaSchema.parse({
      ...criteria,
      rangerId: ' R-101 ',
      incidentType: 'SNARE',
      incidentStatus: 'REPORTED',
      severity: 'HIGH',
      conflictStatus: 'OPEN',
      conflictSource: 'COLLAR',
      conflictType: 'CROP_RAID',
    });
    expect(parsed.rangerId).toBe('R-101');
  });
});

describe('UC-D analytics HTTP validation and authorization', () => {
  test.each([undefined, 'RANGER'])(
    'requires manager authorization (%s)',
    async (role) => {
      const pending = request(app).get('/api/analytics');
      if (role) pending.set('x-user-role', role);
      const response = await pending;
      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('manager');
      expect(prisma.park.findUnique).not.toHaveBeenCalled();
    },
  );
  test.each([
    [{ start: '2026-10-01' }, 'Start Date'],
    [{ start: 'not-a-date' }, 'Start Date'],
    [{ parkId: 'bad-id' }, 'Park'],
    [{ 'categories[]': [] }, 'at least one'],
    [{ 'categories[]': ['INVALID'] }, 'Unsupported'],
    [{ unexpected: 'value' }, 'Malformed'],
  ])(
    'rejects invalid criteria before querying Prisma',
    async (overrides, message) => {
      const response = await analyzeQuery(overrides);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(message);
      expect(prisma.park.findUnique).not.toHaveBeenCalled();
    },
  );
  test('rejects a well-formed but nonexistent park', async () => {
    jest.mocked(prisma.park.findUnique).mockResolvedValueOnce(null);
    const response = await analyzeQuery();
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('does not exist');
    expect(prisma.conservationIncident.findMany).not.toHaveBeenCalled();
  });
  test('passes park and categories through the real analytics logic', async () => {
    const response = await analyzeQuery();
    expect(response.status).toBe(200);
    expect(response.body.data.filters).toEqual(criteria);
    expect(response.body.data.status).toBe('DATA');
    expect(response.body.data.summary.incidents.total).toBe(1);
    expect(prisma.park.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: parkId } }),
    );
    expect(prisma.patrolRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parkId: park.id } }),
    );
    expect(prisma.patrolSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patrolRouteId: { in: [routeId] },
        },
      }),
    );
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patrolSessionId: { in: [sessionId] },
          reportedAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        },
      }),
    );
  });
  test('returns a legitimate no-data success with empty results', async () => {
    jest.mocked(prisma.conservationIncident.findMany).mockResolvedValueOnce([]);
    const response = await analyzeQuery();
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('NO_MATCHING_DATA');
    expect(response.body.data.matchedRecords).toEqual({
      incidents: 0,
      patrols: 0,
    });
    expect(response.body.data.incidents.byType).toEqual([]);
  });
  test('masks internal failures and distinguishes them from no-data', async () => {
    jest
      .mocked(prisma.park.findUnique)
      .mockRejectedValueOnce(new Error('secret database connection string'));
    const response = await analyzeQuery();
    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('Please try again');
    expect(response.body.error.message).not.toContain('secret');
  });
  test('lists actual park records without seeding', async () => {
    jest.mocked(prisma.park.findMany).mockResolvedValue([park]);
    const response = await request(app)
      .get('/api/analytics/parks')
      .set('x-user-role', 'MANAGER');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: parkId, name: park.name, code: park.code },
    ]);
    expect(prisma.park.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    );
  });
  test('an empty park collection does not produce demo options', async () => {
    jest.mocked(prisma.park.findMany).mockResolvedValue([]);
    const response = await request(app)
      .get('/api/analytics/parks')
      .set('x-user-role', 'MANAGER');
    expect(response.body.data).toEqual([]);
  });
  test('preserves malformed-date validation on the legacy report route', async () => {
    const response = await request(app)
      .get('/api/analytics/report')
      .set('x-user-role', 'MANAGER')
      .query({ start: 'not-a-date' });
    expect(response.status).toBe(400);
  });
});

describe('UC-D category and park-scoping boundaries', () => {
  test('does not silently include other parks or unlinked incidents when no sessions exist', async () => {
    jest.mocked(prisma.patrolSession.findMany).mockResolvedValueOnce([]);
    jest.mocked(prisma.conservationIncident.findMany).mockResolvedValueOnce([]);
    const result = await analyticsService.getAnalytics(criteria);
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patrolSessionId: { in: [] } }),
      }),
    );
    expect(result.status).toBe('NO_MATCHING_DATA');
  });
  test('patrol-only criteria query scoped sessions with dates and ranger, without querying incidents', async () => {
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['PATROL_COVERAGE'],
      rangerId: 'R-101',
    });
    expect(prisma.patrolSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patrolRouteId: { in: [routeId] },
          OR: [
            {
              startTime: {
                gte: new Date('2026-09-01'),
                lte: new Date('2026-09-30T23:59:59.999Z'),
              },
            },
            {
              endTime: {
                gte: new Date('2026-09-01'),
                lte: new Date('2026-09-30T23:59:59.999Z'),
              },
            },
            {
              waypoints: {
                some: {
                  timestamp: {
                    gte: new Date('2026-09-01'),
                    lte: new Date('2026-09-30T23:59:59.999Z'),
                  },
                },
              },
            },
          ],
          rangerId: 'R-101',
        },
      }),
    );
    expect(prisma.conservationIncident.findMany).not.toHaveBeenCalled();
    expect(result.matchedRecords.patrols).toBe(1);
    expect(result.categoryAvailability).toEqual([
      { category: 'PATROL_COVERAGE', status: 'AVAILABLE' },
    ]);
  });
  test('hotspots calculate selected geographic results without incident statistics', async () => {
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['INCIDENT_HOTSPOTS'],
      incidentType: 'SNARE',
      rangerId: 'R-101',
    });
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          incidentType: 'SNARE',
          reportedBy: 'R-101',
        }),
      }),
    );
    expect(result.matchedRecords.incidents).toBe(1);
    expect(result.incidents.byType).toEqual([]);
    expect(result.categoryAvailability[0].status).toBe('AVAILABLE');
    expect(result.incidentStatistics).toBeUndefined();
    expect(result.incidentHotspots?.hotspots).toEqual([]);
  });
  test('HWC-only criteria explicitly query all-parks conflicts without unrelated categories', async () => {
    const conflictFind = jest.mocked(prisma.wildlifeConflictAlert.findMany);
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['HWC_TRENDS'],
      severity: 'HIGH',
    });
    expect(conflictFind).toHaveBeenCalledTimes(2);
    expect(conflictFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          severity: 'HIGH',
          createdAt: {
            gte: new Date('2026-09-01T00:00:00Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
        }),
      }),
    );
    expect(result.conflictTrends?.scope).toBe('ALL_PARKS_UNASSIGNED');
    expect(prisma.conservationIncident.findMany).not.toHaveBeenCalled();
    expect(prisma.patrolSession.findMany).not.toHaveBeenCalled();
    expect(result.status).toBe('NO_MATCHING_DATA');
    expect(result.categoryAvailability[0].status).toBe('AVAILABLE_UNSCOPED');
    expect(result.limitations.join(' ')).toContain('no boundary geometry');
  });
});
