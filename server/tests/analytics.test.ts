import { jest } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolSessionModel,
} from '../src/modules/patrols/models.js';
import { ConservationIncidentModel } from '../src/modules/incidents/models.js';
import { WildlifeConflictAlertModel } from '../src/modules/conflict-alerts/models.js';
import { analyticsService } from '../src/modules/analytics/service.js';
import { analysisCriteriaSchema } from '../src/modules/analytics/validation.js';
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';

const app = createApp();
const parkId = '67a000000000000000000001';
const routeId = new Types.ObjectId('67a000000000000000000002');
const sessionId = new Types.ObjectId('67a000000000000000000004');
const criteria: AnalysisCriteria = {
  parkId,
  start: '2026-09-01',
  end: '2026-09-30',
  categories: ['INCIDENT_STATISTICS'],
};
const park = {
  _id: new Types.ObjectId(parkId),
  name: 'Real database park',
  code: 'REAL',
};

// Mock only the database boundary. HTTP parsing, Zod, controllers and UC-D
// business logic remain real, including the single-category query encoding.
function queryResult<T>(value: T) {
  const chain = {
    select: (_fields: string) => chain,
    sort: (_order: object) => chain,
    lean: jest.fn(async () => value),
  };
  return chain;
}
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
  jest
    .spyOn(WildlifeConflictAlertModel, 'find')
    .mockReturnValue(queryResult([]));
  jest.spyOn(ParkModel, 'findById').mockReturnValue(queryResult(park));
  jest
    .spyOn(PatrolRouteModel, 'find')
    .mockReturnValue(queryResult([{ _id: routeId }]));
  jest
    .spyOn(PatrolSessionModel, 'find')
    .mockReturnValue(
      queryResult([
        { _id: sessionId, status: 'COMPLETED', rangerName: 'Ranger' },
      ]),
    );
  jest
    .spyOn(ConservationIncidentModel, 'find')
    .mockReturnValue(
      queryResult([
        {
          incidentType: 'SNARE',
          status: 'REPORTED',
          reportedAt: new Date('2026-09-02'),
          location: { latitude: -2.1523, longitude: 34.8214 },
        },
      ]),
    );
});
afterEach(() => jest.restoreAllMocks());

describe('UC-D Batch 1 criteria contract', () => {
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
      expect(ParkModel.findById).not.toHaveBeenCalled();
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
    'rejects invalid criteria before querying MongoDB',
    async (overrides, message) => {
      const response = await analyzeQuery(overrides);
      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(message);
      expect(ParkModel.findById).not.toHaveBeenCalled();
    },
  );
  test('rejects a well-formed but nonexistent park', async () => {
    jest.mocked(ParkModel.findById).mockReturnValueOnce(queryResult(null));
    const response = await analyzeQuery();
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('does not exist');
    expect(ConservationIncidentModel.find).not.toHaveBeenCalled();
  });
  test('passes park and categories through the real analytics logic', async () => {
    const response = await analyzeQuery();
    expect(response.status).toBe(200);
    expect(response.body.data.filters).toEqual(criteria);
    expect(response.body.data.status).toBe('DATA');
    expect(response.body.data.summary.incidents.total).toBe(1);
    expect(ParkModel.findById).toHaveBeenCalledWith(parkId);
    expect(PatrolRouteModel.find).toHaveBeenCalledWith({ park: park._id });
    expect(PatrolSessionModel.find).toHaveBeenCalledWith({
      patrolRoute: { $in: [routeId] },
    });
    expect(ConservationIncidentModel.find).toHaveBeenCalledWith({
      patrolSession: { $in: [sessionId] },
      reportedAt: {
        $gte: new Date('2026-09-01T00:00:00.000Z'),
        $lte: new Date('2026-09-30T23:59:59.999Z'),
      },
    });
  });
  test('returns a legitimate no-data success with empty results', async () => {
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(queryResult([]));
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
    jest.mocked(ParkModel.findById).mockReturnValueOnce({
      select: () => ({
        lean: async () => {
          throw new Error('secret MongoDB connection string');
        },
      }),
    });
    const response = await analyzeQuery();
    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('Please try again');
    expect(response.body.error.message).not.toContain('secret');
  });
  test('lists actual park records without seeding', async () => {
    jest.spyOn(ParkModel, 'find').mockReturnValue(queryResult([park]));
    const response = await request(app)
      .get('/api/analytics/parks')
      .set('x-user-role', 'MANAGER');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { id: parkId, name: park.name, code: park.code },
    ]);
    expect(ParkModel.find).toHaveBeenCalledWith({});
  });
  test('an empty park collection does not produce demo options', async () => {
    jest.spyOn(ParkModel, 'find').mockReturnValue(queryResult([]));
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
    jest.mocked(PatrolSessionModel.find).mockReturnValueOnce(queryResult([]));
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(queryResult([]));
    const result = await analyticsService.getAnalytics(criteria);
    expect(ConservationIncidentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ patrolSession: { $in: [] } }),
    );
    expect(result.status).toBe('NO_MATCHING_DATA');
  });
  test('patrol-only criteria query scoped sessions with dates and ranger, without querying incidents', async () => {
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['PATROL_COVERAGE'],
      rangerId: 'R-101',
    });
    expect(PatrolSessionModel.find).toHaveBeenCalledWith({
      patrolRoute: { $in: [routeId] },
      startTime: {
        $gte: new Date('2026-09-01T00:00:00.000Z'),
        $lte: new Date('2026-09-30T23:59:59.999Z'),
      },
      rangerId: 'R-101',
    });
    expect(ConservationIncidentModel.find).not.toHaveBeenCalled();
    expect(result.matchedRecords.patrols).toBe(1);
    expect(result.categoryAvailability).toEqual([
      { category: 'PATROL_COVERAGE', status: 'NOT_IMPLEMENTED' },
    ]);
  });
  test('hotspots calculate selected geographic results without incident statistics', async () => {
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['INCIDENT_HOTSPOTS'],
      incidentType: 'SNARE',
      rangerId: 'R-101',
    });
    expect(ConservationIncidentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ incidentType: 'SNARE', reportedBy: 'R-101' }),
    );
    expect(result.matchedRecords.incidents).toBe(1);
    expect(result.incidents.byType).toEqual([]);
    expect(result.categoryAvailability[0].status).toBe('AVAILABLE');
    expect(result.incidentStatistics).toBeUndefined();
    expect(result.incidentHotspots?.hotspots).toEqual([]);
  });
  test('HWC-only criteria explicitly query all-parks conflicts without unrelated categories', async () => {
    const conflictFind = jest.spyOn(WildlifeConflictAlertModel, 'find');
    const result = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['HWC_TRENDS'],
      severity: 'HIGH',
    });
    expect(conflictFind).toHaveBeenCalledTimes(2);
    expect(conflictFind).toHaveBeenCalledWith({
      severity: 'HIGH',
      createdAt: {
        $gte: new Date('2026-09-01T00:00:00Z'),
        $lte: new Date('2026-09-30T23:59:59.999Z'),
      },
    });
    expect(result.conflictTrends?.scope).toBe('ALL_PARKS_UNASSIGNED');
    expect(ConservationIncidentModel.find).not.toHaveBeenCalled();
    expect(PatrolSessionModel.find).not.toHaveBeenCalled();
    expect(result.status).toBe('NO_MATCHING_DATA');
    expect(result.categoryAvailability[0].status).toBe('AVAILABLE_UNSCOPED');
    expect(result.limitations.join(' ')).toContain('no boundary geometry');
  });
});
