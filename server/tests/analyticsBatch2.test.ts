import { jest } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { analyticsService } from '../src/modules/analytics/service.js';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolSessionModel,
} from '../src/modules/patrols/models.js';
import { ConservationIncidentModel } from '../src/modules/incidents/models.js';
import { WildlifeConflictAlertModel } from '../src/modules/conflict-alerts/models.js';
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';

const parkId = '67a000000000000000000001';
const route = new Types.ObjectId('67a000000000000000000002');
const session = new Types.ObjectId('67a000000000000000000004');
const base: AnalysisCriteria = {
  parkId,
  start: '2026-09-01',
  end: '2026-09-30',
  categories: ['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS'],
};
function queryResult<T>(value: T) {
  const chain = { select: (_fields: string) => chain, lean: async () => value };
  return chain;
}
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
  jest.spyOn(ParkModel, 'findById').mockReturnValue(
    queryResult({
      _id: new Types.ObjectId(parkId),
      name: 'Database park',
      code: 'DB',
    }),
  );
  jest
    .spyOn(PatrolRouteModel, 'find')
    .mockReturnValue(queryResult([{ _id: route }]));
  jest
    .spyOn(PatrolSessionModel, 'find')
    .mockReturnValue(queryResult([{ _id: session }]));
  jest
    .spyOn(ConservationIncidentModel, 'find')
    .mockReturnValue(queryResult(incidentRows));
  jest
    .spyOn(WildlifeConflictAlertModel, 'find')
    .mockReturnValue(queryResult([]));
});
afterEach(() => jest.restoreAllMocks());

describe('UC-D Batch 2 scoped incident query and category contract', () => {
  test('shares the park/date/type/ranger query between statistics and hotspots', async () => {
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(
        queryResult(
          incidentRows.filter(
            (row) => row.incidentType === 'SNARE' && row.status === 'REPORTED',
          ),
        ),
      );
    const data = await analyticsService.getAnalytics({
      ...base,
      rangerId: 'R-101',
      incidentType: 'SNARE',
      incidentStatus: 'REPORTED',
    });
    expect(ConservationIncidentModel.find).toHaveBeenCalledTimes(1);
    expect(ConservationIncidentModel.find).toHaveBeenCalledWith({
      patrolSession: { $in: [session] },
      reportedAt: {
        $gte: new Date('2026-09-01T00:00:00Z'),
        $lte: new Date('2026-09-30T23:59:59.999Z'),
      },
      reportedBy: 'R-101',
      incidentType: 'SNARE',
      status: 'REPORTED',
    });
    expect(PatrolRouteModel.find).toHaveBeenCalledWith({
      park: new Types.ObjectId(parkId),
    });
    expect(data.incidentStatistics?.total).toBe(2);
    expect(data.incidentHotspots?.hotspots[0].incidentCount).toBe(2);
    expect(data.conflictTrends).toBeUndefined();
    expect(WildlifeConflictAlertModel.find).not.toHaveBeenCalled();
  });
  test('changing park changes route/session membership rather than broadening queries', async () => {
    const otherPark = '67a000000000000000000099';
    jest.mocked(ParkModel.findById).mockReturnValueOnce(
      queryResult({
        _id: new Types.ObjectId(otherPark),
        name: 'Other park',
        code: 'OTHER',
      }),
    );
    jest.mocked(PatrolRouteModel.find).mockReturnValueOnce(queryResult([]));
    jest.mocked(PatrolSessionModel.find).mockReturnValueOnce(queryResult([]));
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(queryResult([]));
    const data = await analyticsService.getAnalytics({
      ...base,
      parkId: otherPark,
    });
    expect(PatrolRouteModel.find).toHaveBeenCalledWith({
      park: new Types.ObjectId(otherPark),
    });
    expect(PatrolSessionModel.find).toHaveBeenCalledWith({
      patrolRoute: { $in: [] },
    });
    expect(ConservationIncidentModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ patrolSession: { $in: [] } }),
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
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(queryResult([]));
    const data = await analyticsService.getAnalytics(base);
    expect(data.status).toBe('NO_MATCHING_DATA');
    expect(data.incidentStatistics?.total).toBe(0);
    expect(data.incidentHotspots?.hotspots).toEqual([]);
  });
  test('basic scoped PDF refuses an empty analysis', async () => {
    jest
      .mocked(ConservationIncidentModel.find)
      .mockReturnValueOnce(queryResult([]));
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

describe('UC-D all-parks conflict trends with explicit scope', () => {
  test('applies reliable conflict filters and includes responses to alerts created before the period', async () => {
    jest
      .mocked(WildlifeConflictAlertModel.find)
      .mockReturnValueOnce(
        queryResult([
          {
            severity: 'HIGH',
            status: 'OPEN',
            source: 'COLLAR',
            alertType: 'CROP_RAID',
            createdAt: new Date('2026-09-02'),
          },
        ]),
      )
      .mockReturnValueOnce(
        queryResult([
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
        ]),
      );
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
      acknowledgedBy: 'R-101',
      severity: 'HIGH',
      status: 'OPEN',
      source: 'COLLAR',
      alertType: 'CROP_RAID',
    };
    const range = {
      $gte: new Date('2026-09-01'),
      $lte: new Date('2026-09-30T23:59:59.999Z'),
    };
    expect(WildlifeConflictAlertModel.find).toHaveBeenNthCalledWith(1, {
      ...filters,
      createdAt: range,
    });
    expect(WildlifeConflictAlertModel.find).toHaveBeenNthCalledWith(2, {
      ...filters,
      'responses.respondedAt': range,
    });
    expect(data.conflictTrends).toMatchObject({
      scope: 'ALL_PARKS_UNASSIGNED',
      totalAlerts: 1,
      totalResponses: 1,
      responsesByAction: [{ name: 'INVESTIGATED_AREA', count: 1 }],
    });
    expect(data.conflictTrends?.scopeNotice).toContain('not the selected park');
    expect(data.categoryAvailability).toEqual([
      { category: 'HWC_TRENDS', status: 'AVAILABLE_UNSCOPED' },
    ]);
    expect(PatrolRouteModel.find).not.toHaveBeenCalled();
    expect(ConservationIncidentModel.find).not.toHaveBeenCalled();
    expect(data.status).toBe('DATA');
  });
  test('response-only activity is meaningful data, not an empty analysis', async () => {
    jest
      .mocked(WildlifeConflictAlertModel.find)
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(
        queryResult([
          {
            responses: [
              {
                action: 'INVESTIGATED_AREA',
                respondedAt: new Date('2026-09-10'),
              },
            ],
          },
        ]),
      );
    const data = await analyticsService.getAnalytics({
      ...base,
      categories: ['HWC_TRENDS'],
    });
    expect(data.status).toBe('DATA');
    expect(data.matchedRecords).toMatchObject({ conflicts: 0, responses: 1 });
    expect(data.conflictTrends?.totalAlerts).toBe(0);
  });
  test('an empty all-parks query is no-data, and still exposes the park limitation', async () => {
    const data = await analyticsService.getAnalytics({
      ...base,
      categories: ['HWC_TRENDS'],
    });
    expect(data.status).toBe('NO_MATCHING_DATA');
    expect(data.conflictTrends?.totalResponses).toBe(0);
    expect(data.limitations.join(' ')).toContain('no boundary geometry');
  });
  test('mixed categories retain separate scopes in the JSON and basic PDF', async () => {
    jest.mocked(WildlifeConflictAlertModel.find).mockReturnValue(
      queryResult([
        {
          severity: 'HIGH',
          status: 'OPEN',
          source: 'COLLAR',
          alertType: 'CROP_RAID',
          createdAt: new Date('2026-09-02'),
          responses: [],
        },
      ]),
    );
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
    expect(response.body.data.conflictTrends.scope).toBe(
      'ALL_PARKS_UNASSIGNED',
    );
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
    expect(Buffer.from(report.body).toString()).toContain(
      'ALL PARKS / UNASSIGNED',
    );
  });
});
