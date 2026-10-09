import { jest } from '@jest/globals';
import request from 'supertest';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';
const { createApp } = await import('../src/app.js');
const { analyticsService } =
  await import('../src/modules/analytics/service.js');
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';

const parkId = 'c67a000000000000000000001';
const route = 'c67a000000000000000000002';
const session = 'c67a000000000000000000004';
const base: AnalysisCriteria = {
  parkId,
  start: '2026-09-01',
  end: '2026-09-30',
  categories: ['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS'],
};
const incidentRows = [1, 2, 3].map((index) => ({
  incidentType: index === 3 ? 'OTHER' : 'SNARE',
  status: index === 3 ? 'RESOLVED' : 'REPORTED',
  reportedAt: new Date('2026-09-02'),
  location: {
    latitude: -2.151 - index * 0.001,
    longitude: 34.821 + index * 0.001,
  },
}));

beforeEach(() => {
  resetAnalyticsPrisma();
  jest.mocked(prisma.park.findUnique).mockResolvedValue({
    id: parkId,
    name: 'Database park',
    code: 'DB',
  });
  jest.mocked(prisma.patrolRoute.findMany).mockResolvedValue([{ id: route }]);
  jest
    .mocked(prisma.patrolSession.findMany)
    .mockResolvedValue([{ id: session }]);
  jest
    .mocked(prisma.conservationIncident.findMany)
    .mockResolvedValue(incidentRows);
  jest.mocked(prisma.wildlifeConflictAlert.findMany).mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('UC-D Batch 2 scoped incident query and category contract', () => {
  test('shares the park/date/type/ranger query between statistics and hotspots', async () => {
    jest
      .mocked(prisma.conservationIncident.findMany)
      .mockResolvedValueOnce(
        incidentRows.filter(
          (row) => row.incidentType === 'SNARE' && row.status === 'REPORTED',
        ),
      );
    const data = await analyticsService.getAnalytics({
      ...base,
      rangerId: 'R-101',
      incidentType: 'SNARE',
      incidentStatus: 'REPORTED',
    });
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { patrolSessionId: { in: [session] } },
            { patrolSessionId: null, parkId },
          ],
          // Withdrawn incident reports are excluded from analytics.
          deletedAt: null,
          reportedAt: {
            gte: new Date('2026-09-01T00:00:00Z'),
            lte: new Date('2026-09-30T23:59:59.999Z'),
          },
          reportedBy: 'R-101',
          incidentType: 'SNARE',
          status: 'REPORTED',
        },
      }),
    );
    expect(prisma.patrolRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parkId: parkId,
        },
      }),
    );
    expect(data.incidentStatistics?.total).toBe(2);
    expect(data.incidentHotspots?.hotspots[0].incidentCount).toBe(2);
    expect(data.conflictTrends).toBeUndefined();
    expect(prisma.wildlifeConflictAlert.findMany).not.toHaveBeenCalled();
  });
  test('changing park changes route/session membership rather than broadening queries', async () => {
    const otherPark = 'c67a000000000000000000099';
    jest.mocked(prisma.park.findUnique).mockResolvedValueOnce({
      id: otherPark,
      name: 'Other park',
      code: 'OTHER',
    });
    jest.mocked(prisma.patrolRoute.findMany).mockResolvedValueOnce([]);
    jest.mocked(prisma.patrolSession.findMany).mockResolvedValueOnce([]);
    jest.mocked(prisma.conservationIncident.findMany).mockResolvedValueOnce([]);
    const data = await analyticsService.getAnalytics({
      ...base,
      parkId: otherPark,
    });
    expect(prisma.patrolRoute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parkId: otherPark,
        },
      }),
    );
    expect(prisma.patrolSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patrolRouteId: { in: [] },
        },
      }),
    );
    expect(prisma.conservationIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { patrolSessionId: { in: [] } },
            { patrolSessionId: null, parkId: otherPark },
          ],
        }),
      }),
    );
    expect(data.incidentHotspots?.hotspots).toEqual([]);
    expect(data.status).toBe('NO_MATCHING_DATA');
  });
  test.each(['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS'] as const)(
    'only returns details for selected %s',
    async (category) => {
      const data = await analyticsService.getAnalytics({
        ...base,
        categories: [category],
      });
      expect(data.incidentStatistics !== undefined).toBe(
        category === 'INCIDENT_STATISTICS',
      );
      expect(data.incidentHotspots !== undefined).toBe(
        category === 'INCIDENT_HOTSPOTS',
      );
      expect(data.categoryAvailability).toEqual([
        { category, status: 'AVAILABLE' },
      ]);
    },
  );
  test('empty scoped incidents retain successful no-data and empty hotspots', async () => {
    jest.mocked(prisma.conservationIncident.findMany).mockResolvedValueOnce([]);
    const data = await analyticsService.getAnalytics(base);
    expect(data.status).toBe('NO_MATCHING_DATA');
    expect(data.incidentStatistics?.total).toBe(0);
    expect(data.incidentHotspots?.hotspots).toEqual([]);
  });
  test('basic scoped PDF refuses an empty analysis', async () => {
    jest.mocked(prisma.conservationIncident.findMany).mockResolvedValueOnce([]);
    const response = await request(createApp())
      .get('/api/analytics/report')
      .set('x-user-role', 'MANAGER')
      .query({
        parkId,
        start: base.start,
        end: base.end,
        'categories[]': base.categories,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(
      'requires matching conservation data',
    );
  });
});

describe('UC-D selected-park conflict trends', () => {
  test('applies reliable conflict filters and includes responses to alerts created before the period', async () => {
    jest
      .mocked(prisma.wildlifeConflictAlert.findMany)
      .mockResolvedValueOnce([
        {
          severity: 'HIGH',
          status: 'OPEN',
          source: 'COLLAR',
          alertType: 'CROP_RAID',
          createdAt: new Date('2026-09-02'),
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2025-01-01'),
          responses: [
            {
              action: 'INVESTIGATED_AREA',
              respondedAt: new Date('2026-09-30T23:59:59.999Z'),
            },
            { action: 'OTHER', respondedAt: new Date('2026-10-01') },
            { action: 'OTHER', respondedAt: new Date('2026-08-31') },
          ],
        },
      ]);
    const data = await analyticsService.getAnalytics({
      ...base,
      categories: ['HWC_TRENDS'],
      rangerId: 'R-101',
      severity: 'HIGH',
      conflictStatus: 'OPEN',
      conflictSource: 'COLLAR',
      conflictType: 'CROP_RAID',
    });
    const filters = {
      parkId,
      acknowledgedBy: 'R-101',
      severity: 'HIGH',
      status: 'OPEN',
      source: 'COLLAR',
      alertType: 'CROP_RAID',
    };
    const range = {
      gte: new Date('2026-09-01'),
      lte: new Date('2026-09-30T23:59:59.999Z'),
    };
    expect(prisma.wildlifeConflictAlert.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          ...filters,
          createdAt: range,
        },
      }),
    );
    expect(prisma.wildlifeConflictAlert.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          ...filters,
          responses: { some: { respondedAt: range } },
        },
      }),
    );
    expect(data.conflictTrends).toMatchObject({
      scope: 'SELECTED_PARK',
      totalAlerts: 1,
      totalResponses: 1,
      responsesByAction: [{ name: 'INVESTIGATED_AREA', count: 1 }],
    });
    expect(data.conflictTrends?.scopeNotice).toContain(
      'assigned to the selected park',
    );
    expect(data.categoryAvailability).toEqual([
      { category: 'HWC_TRENDS', status: 'AVAILABLE' },
    ]);
    expect(prisma.patrolRoute.findMany).not.toHaveBeenCalled();
    expect(prisma.conservationIncident.findMany).not.toHaveBeenCalled();
    expect(data.status).toBe('DATA');
  });
  test('response-only activity is meaningful data, not an empty analysis', async () => {
    jest
      .mocked(prisma.wildlifeConflictAlert.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          responses: [
            {
              action: 'INVESTIGATED_AREA',
              respondedAt: new Date('2026-09-10'),
            },
          ],
        },
      ]);
    const data = await analyticsService.getAnalytics({
      ...base,
      categories: ['HWC_TRENDS'],
    });
    expect(data.status).toBe('DATA');
    expect(data.matchedRecords).toMatchObject({ conflicts: 0, responses: 1 });
    expect(data.conflictTrends?.totalAlerts).toBe(0);
  });
  test('an empty park query is no-data and explains legacy exclusion', async () => {
    const data = await analyticsService.getAnalytics({
      ...base,
      categories: ['HWC_TRENDS'],
    });
    expect(data.status).toBe('NO_MATCHING_DATA');
    expect(data.conflictTrends?.totalResponses).toBe(0);
    expect(data.limitations.join(' ')).toContain('Legacy/unassigned');
  });
  test('mixed categories retain the selected park scope in the JSON and basic PDF', async () => {
    jest.mocked(prisma.wildlifeConflictAlert.findMany).mockResolvedValue([
      {
        severity: 'HIGH',
        status: 'OPEN',
        source: 'COLLAR',
        alertType: 'CROP_RAID',
        createdAt: new Date('2026-09-02'),
        responses: [],
      },
    ]);
    const response = await request(createApp())
      .get('/api/analytics')
      .set('x-user-role', 'MANAGER')
      .query({
        parkId,
        start: base.start,
        end: base.end,
        'categories[]': [...base.categories, 'HWC_TRENDS'],
      });
    expect(response.status).toBe(200);
    expect(response.body.data.incidentStatistics.total).toBe(3);
    expect(response.body.data.conflictTrends.scope).toBe('SELECTED_PARK');
    const report = await request(createApp())
      .get('/api/analytics/report')
      .set('x-user-role', 'MANAGER')
      .query({
        parkId,
        start: base.start,
        end: base.end,
        'categories[]': ['HWC_TRENDS'],
      });
    expect(report.status).toBe(200);
    expect(Buffer.from(report.body).toString()).toContain('SELECTED PARK');
  });
});
