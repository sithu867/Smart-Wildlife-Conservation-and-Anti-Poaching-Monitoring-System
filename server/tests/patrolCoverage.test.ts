import { jest } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { calculatePatrolCoverage } from '../src/modules/analytics/patrolCoverage.js';
import { analyticsService } from '../src/modules/analytics/service.js';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolSessionModel,
} from '../src/modules/patrols/models.js';
import { ConservationIncidentModel } from '../src/modules/incidents/models.js';
import { WildlifeConflictAlertModel } from '../src/modules/conflict-alerts/models.js';
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-09-30T23:59:59.999Z');
const routes = ['Boundary', 'River', 'Forest'].map((name, index) => ({
  _id: new Types.ObjectId(`67a00000000000000000000${index + 2}`),
  name,
  geometry: {
    type: 'LineString',
    coordinates: [
      [34.8, -2.1],
      [34.9, -2.2],
    ],
  },
}));
const session = {
  patrolRoute: routes[0]._id,
  startTime: start,
  status: 'COMPLETED',
  endTime: end,
};
const waypoint = { latitude: -2.1, longitude: 34.8, timestamp: end };

describe('UC-D route coverage classification', () => {
  test('counts every registered route, classifies completed/active/neglected, and calculates rounded route coverage', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        session,
        {
          ...session,
          patrolRoute: routes[1]._id,
          status: 'ACTIVE',
          endTime: null,
        },
      ],
      start,
      end,
    );
    expect(data).toMatchObject({
      totalRoutes: 3,
      coveredRoutes: 1,
      limitedActivityRoutes: 1,
      neglectedRoutes: 1,
      coveragePercentage: 33.3,
      patrolSessionCount: 2,
      completedPatrolCount: 1,
    });
    expect(data.routes.map((route) => [route.routeName, route.status])).toEqual(
      [
        ['Boundary', 'COVERED'],
        ['Forest', 'NEGLECTED'],
        ['River', 'LIMITED_ACTIVITY'],
      ],
    );
    expect(data.routes[0]).toMatchObject({
      sessionCount: 1,
      completedSessionCount: 1,
      lastPatrolDate: end.toISOString(),
      geometry: routes[0].geometry,
    });
    expect(data.routes[1].lastPatrolDate).toBeNull();
  });
  test('multiple sessions never inflate the route denominator or covered-route count', () => {
    const data = calculatePatrolCoverage(
      routes,
      [session, session, { ...session, status: 'ACTIVE', endTime: null }],
      start,
      end,
    );
    expect(data.coveredRoutes).toBe(1);
    expect(data.coveragePercentage).toBe(33.3);
    expect(data.completedPatrolCount).toBe(2);
    expect(data.routes[0].sessionCount).toBe(3);
  });
  test('zero routes returns zero percentage and no fabricated routes', () => {
    expect(calculatePatrolCoverage([], [], start, end)).toMatchObject({
      totalRoutes: 0,
      coveragePercentage: 0,
      routes: [],
      patrolSessionCount: 0,
    });
  });
  test('completed patrols are dated by completion, including those started before the period', () => {
    const data = calculatePatrolCoverage(
      routes,
      [{ ...session, startTime: '2026-08-31' }],
      start,
      end,
    );
    expect(data.routes[0].status).toBe('COVERED');
    expect(data.routes[0].lastPatrolDate).toBe(end.toISOString());
    const later = calculatePatrolCoverage(
      routes,
      [{ ...session, endTime: '2026-10-01' }],
      start,
      end,
    );
    expect(later.routes[0].status).toBe('LIMITED_ACTIVITY');
    expect(later.completedPatrolCount).toBe(0);
  });
  test('dates are inclusive and sessions outside the period are ignored', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        { ...session, endTime: '2026-08-31', startTime: '2026-08-30' },
        { ...session, endTime: '2026-10-01', startTime: '2026-10-01' },
        { ...session, status: 'ACTIVE', startTime: end, endTime: null },
      ],
      start,
      end,
    );
    expect(data.patrolSessionCount).toBe(1);
    expect(data.routes[0].status).toBe('LIMITED_ACTIVITY');
    expect(data.routes[0].lastPatrolDate).toBe(end.toISOString());
  });
  test('valid waypoints evidence in-period activity on an older session; invalid or out-of-period waypoints do not', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        {
          ...session,
          startTime: '2026-08-01',
          endTime: null,
          status: 'ACTIVE',
          waypoints: [
            waypoint,
            { ...waypoint, latitude: 100 },
            { ...waypoint, timestamp: '2026-10-01' },
          ],
        },
        {
          ...session,
          patrolRoute: routes[1]._id,
          startTime: '2026-08-01',
          endTime: null,
          status: 'ACTIVE',
          waypoints: [
            { ...waypoint, longitude: NaN },
            { ...waypoint, timestamp: 'broken' },
          ],
        },
      ],
      start,
      end,
    );
    expect(data.routes[0]).toMatchObject({
      status: 'LIMITED_ACTIVITY',
      waypointCount: 1,
      sessionCount: 1,
      lastPatrolDate: end.toISOString(),
    });
    expect(
      data.routes.find((route) => route.routeName === 'River')?.status,
    ).toBe('NEGLECTED');
  });
  test('ASSIGNED alone and unknown states are not activity, but valid waypoint evidence is usable', () => {
    expect(
      calculatePatrolCoverage(
        routes,
        [
          { ...session, status: 'ASSIGNED' },
          { ...session, status: 'UNKNOWN' },
        ],
        start,
        end,
      ).routes[0].status,
    ).toBe('NEGLECTED');
    expect(
      calculatePatrolCoverage(
        routes,
        [{ ...session, status: 'ASSIGNED', waypoints: [waypoint] }],
        start,
        end,
      ).routes[0].status,
    ).toBe('LIMITED_ACTIVITY');
  });
  test('malformed historical waypoint entries or arrays are ignored without failing the analysis', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        {
          ...session,
          status: 'ACTIVE',
          waypoints: [null, {}, { ...waypoint, timestamp: {} }, waypoint],
        },
        {
          ...session,
          patrolRoute: routes[1]._id,
          startTime: '2026-08-01',
          status: 'ASSIGNED',
          waypoints: { invalid: 'array' },
        },
      ],
      start,
      end,
    );
    expect(data.routes[0].waypointCount).toBe(1);
    expect(
      data.routes.find((route) => route.routeName === 'River')?.status,
    ).toBe('NEGLECTED');
  });
  test('legacy completed documents without endTime use startTime; invalid dates never fabricate activity', () => {
    expect(
      calculatePatrolCoverage(
        routes,
        [{ ...session, endTime: undefined }],
        start,
        end,
      ).coveredRoutes,
    ).toBe(1);
    expect(
      calculatePatrolCoverage(
        routes,
        [{ ...session, startTime: 'invalid', endTime: undefined }],
        start,
        end,
      ).patrolSessionCount,
    ).toBe(0);
  });
  test('invalid completion dates and waypoints outside the known session lifecycle never fabricate coverage', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        { ...session, endTime: 'invalid' },
        {
          ...session,
          patrolRoute: routes[1]._id,
          startTime: '2026-09-20',
          endTime: '2026-09-10',
          waypoints: [waypoint],
        },
        {
          ...session,
          patrolRoute: routes[2]._id,
          startTime: '2026-10-01',
          endTime: '2026-09-20',
          waypoints: [waypoint],
        },
      ],
      start,
      end,
    );
    expect(data.coveredRoutes).toBe(0);
    expect(data.limitedActivityRoutes).toBe(2);
    expect(data.neglectedRoutes).toBe(1);
    expect(data.routes.every((route) => route.waypointCount === 0)).toBe(true);
  });
  test('missing, malformed and other-park route links are ignored and counted without assigning them by proximity', () => {
    const data = calculatePatrolCoverage(
      routes,
      [
        session,
        { ...session, patrolRoute: undefined },
        { ...session, patrolRoute: 'bad-reference' },
        {
          ...session,
          patrolRoute: new Types.ObjectId(),
          waypoints: [waypoint],
        },
      ],
      start,
      end,
    );
    expect(data.excludedSessionCount).toBe(3);
    expect(data.patrolSessionCount).toBe(1);
    expect(data.coveredRoutes).toBe(1);
  });
  test('missing or broken geometry preserves route classification without connecting fake paths', () => {
    const data = calculatePatrolCoverage(
      [
        { ...routes[0], geometry: undefined },
        {
          ...routes[1],
          geometry: {
            type: 'LineString',
            coordinates: [
              [34, -2],
              [200, -2],
              [35, -2],
            ],
          },
        },
        routes[2],
      ],
      [session],
      start,
      end,
    );
    expect(data.missingGeometryRouteCount).toBe(2);
    expect(data.routes[0]).toMatchObject({ status: 'COVERED', geometry: null });
    expect(data.totalRoutes).toBe(3);
  });
});

function queryResult<T>(value: T) {
  const chain = { select: (_fields: string) => chain, lean: async () => value };
  return chain;
}
const criteria: AnalysisCriteria = {
  parkId: '67a000000000000000000001',
  start: '2026-09-01',
  end: '2026-09-30',
  categories: ['PATROL_COVERAGE'],
};
describe('UC-D patrol coverage query integration', () => {
  beforeEach(() => {
    jest.spyOn(ParkModel, 'findById').mockReturnValue(
      queryResult({
        _id: new Types.ObjectId(criteria.parkId),
        name: 'Park',
        code: 'P',
      }),
    );
    jest.spyOn(PatrolRouteModel, 'find').mockReturnValue(queryResult(routes));
    jest
      .spyOn(PatrolSessionModel, 'find')
      .mockReturnValue(queryResult([session]));
    jest
      .spyOn(ConservationIncidentModel, 'find')
      .mockReturnValue(queryResult([]));
    jest
      .spyOn(WildlifeConflictAlertModel, 'find')
      .mockReturnValue(queryResult([]));
  });
  afterEach(() => jest.restoreAllMocks());
  test('queries the selected park and its route IDs with all activity dates and ranger filtering', async () => {
    const data = await analyticsService.getAnalytics({
      ...criteria,
      rangerId: 'R-101',
    });
    expect(PatrolRouteModel.find).toHaveBeenCalledWith({
      park: new Types.ObjectId(criteria.parkId),
    });
    expect(PatrolSessionModel.find).toHaveBeenCalledWith({
      patrolRoute: { $in: routes.map((route) => route._id) },
      rangerId: 'R-101',
      $or: [
        { startTime: { $gte: start, $lte: end } },
        { endTime: { $gte: start, $lte: end } },
        { 'waypoints.timestamp': { $gte: start, $lte: end } },
      ],
    });
    expect(data.patrolCoverage).toMatchObject({
      totalRoutes: 3,
      coveredRoutes: 1,
      coveragePercentage: 33.3,
    });
    expect(data.categoryAvailability).toEqual([
      { category: 'PATROL_COVERAGE', status: 'AVAILABLE' },
    ]);
    expect(ConservationIncidentModel.find).not.toHaveBeenCalled();
    expect(WildlifeConflictAlertModel.find).not.toHaveBeenCalled();
  });
  test('changing park changes the route set and excludes another park session even if the database boundary returns it', async () => {
    const otherParkId = '67a000000000000000000099';
    jest.mocked(ParkModel.findById).mockReturnValueOnce(
      queryResult({
        _id: new Types.ObjectId(otherParkId),
        name: 'Other',
        code: 'O',
      }),
    );
    jest
      .mocked(PatrolRouteModel.find)
      .mockReturnValueOnce(queryResult([routes[2]]));
    const data = await analyticsService.getAnalytics({
      ...criteria,
      parkId: otherParkId,
    });
    expect(PatrolRouteModel.find).toHaveBeenCalledWith({
      park: new Types.ObjectId(otherParkId),
    });
    expect(data.patrolCoverage).toMatchObject({
      totalRoutes: 1,
      coveredRoutes: 0,
      neglectedRoutes: 1,
      excludedSessionCount: 1,
    });
    expect(data.matchedRecords.patrols).toBe(0);
  });
  test('no activity yields meaningful neglected-route results rather than hiding registered routes', async () => {
    jest.mocked(PatrolSessionModel.find).mockReturnValueOnce(queryResult([]));
    const data = await analyticsService.getAnalytics(criteria);
    expect(data.status).toBe('DATA');
    expect(data.patrolCoverage).toMatchObject({
      neglectedRoutes: 3,
      coveragePercentage: 0,
      patrolSessionCount: 0,
    });
  });
  test('neglected-route results do not bypass the existing basic report source-record guard', async () => {
    jest.mocked(PatrolSessionModel.find).mockReturnValueOnce(queryResult([]));
    const response = await request(createApp())
      .get('/api/analytics/report')
      .set('x-user-role', 'MANAGER')
      .query({
        parkId: criteria.parkId,
        start: criteria.start,
        end: criteria.end,
        'categories[]': criteria.categories,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(
      'requires matching conservation data',
    );
  });
  test('a park with no routes returns successful no-data and a zero coverage section', async () => {
    jest.mocked(PatrolRouteModel.find).mockReturnValueOnce(queryResult([]));
    jest.mocked(PatrolSessionModel.find).mockReturnValueOnce(queryResult([]));
    const data = await analyticsService.getAnalytics(criteria);
    expect(data.status).toBe('NO_MATCHING_DATA');
    expect(data.patrolCoverage).toMatchObject({
      totalRoutes: 0,
      coveragePercentage: 0,
    });
  });
  test('coverage is omitted and patrol source queries are skipped when only HWC is selected', async () => {
    const data = await analyticsService.getAnalytics({
      ...criteria,
      categories: ['HWC_TRENDS'],
    });
    expect(data.patrolCoverage).toBeUndefined();
    expect(PatrolRouteModel.find).not.toHaveBeenCalled();
    expect(PatrolSessionModel.find).not.toHaveBeenCalled();
  });
});
