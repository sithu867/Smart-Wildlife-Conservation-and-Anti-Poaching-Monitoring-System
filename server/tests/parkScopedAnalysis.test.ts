import { jest } from '@jest/globals';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';
import { calculateConflictLocations } from '../src/modules/analytics/conflictLocations.js';
import { calculatePatrolCoverage } from '../src/modules/analytics/patrolCoverage.js';
import { calculateIncidentHotspots } from '../src/modules/analytics/hotspots.js';
import type { AnalysisCriteria } from '../src/modules/analytics/contract.js';
const { getCriteriaAnalytics } =
  await import('../src/modules/analytics/criteriaService.js');

const parkA = 'c67a000000000000000000001';
const parkB = 'c67a000000000000000000099';
const criteria: AnalysisCriteria = {
  parkId: parkA,
  start: '2026-09-01',
  end: '2026-09-30',
  categories: [
    'INCIDENT_STATISTICS',
    'INCIDENT_HOTSPOTS',
    'PATROL_COVERAGE',
    'HWC_TRENDS',
  ],
};
const end = new Date('2026-09-30T23:59:59.999Z');
const location = { latitude: -2.152, longitude: 34.822 };

// Evaluate the actual Prisma where inputs against two parks' mixed records.
// Unlike fixed mockResolvedValue rows, a missing park/date/filter predicate
// changes the result and fails these cross-park regression tests.
function matches(row: object, where: unknown): boolean {
  if (!where || typeof where !== 'object') return true;
  const fields = row as Record<string, unknown>;
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (key === 'OR')
      return (expected as unknown[]).some((clause) => matches(row, clause));
    const actual = fields[key];
    if (expected === null) return actual == null;
    if (typeof expected !== 'object') return actual === expected;
    const predicate = expected as Record<string, unknown>;
    if ('in' in predicate) return (predicate.in as unknown[]).includes(actual);
    if ('some' in predicate)
      return (
        Array.isArray(actual) &&
        actual.some((item) => matches(item, predicate.some))
      );
    if ('gte' in predicate || 'lte' in predicate) {
      return (
        actual instanceof Date &&
        (!(predicate.gte instanceof Date) || actual >= predicate.gte) &&
        (!(predicate.lte instanceof Date) || actual <= predicate.lte)
      );
    }
    return (
      actual !== null && typeof actual === 'object' && matches(actual, expected)
    );
  });
}
const routes = [
  { id: 'route-a', parkId: parkA, name: 'A route' },
  { id: 'route-a2', parkId: parkA, name: 'A neglected' },
  { id: 'route-b', parkId: parkB, name: 'B route' },
];
const waypoint = {
  id: 'wp-a',
  latitude: -2.152,
  longitude: 34.822,
  timestamp: end,
};
const sessions = [
  {
    id: 'session-a',
    patrolRouteId: 'route-a',
    rangerId: 'R-101',
    status: 'COMPLETED',
    startTime: new Date('2026-08-01'),
    endTime: end,
    waypoints: [waypoint, waypoint],
  },
  {
    id: 'session-cancelled',
    patrolRouteId: 'route-a2',
    rangerId: 'R-101',
    status: 'CANCELLED',
    startTime: end,
    endTime: end,
    waypoints: [waypoint],
  },
  {
    id: 'session-b',
    patrolRouteId: 'route-b',
    rangerId: 'R-102',
    status: 'ACTIVE',
    startTime: end,
    endTime: null,
    waypoints: [],
  },
];
const incident = {
  incidentType: 'SNARE',
  status: 'REPORTED',
  reportedAt: end,
  location,
  reportedBy: 'R-101',
};
const incidents = [
  { ...incident, id: 'linked-a', patrolSessionId: 'session-a', parkId: null },
  { ...incident, id: 'explicit-a', patrolSessionId: null, parkId: parkA },
  { ...incident, id: 'legacy', patrolSessionId: null, parkId: null },
  {
    ...incident,
    id: 'other-park',
    patrolSessionId: 'session-b',
    parkId: parkA,
  }, // conflicting explicit value cannot override the patrol
  {
    ...incident,
    id: 'after',
    patrolSessionId: null,
    parkId: parkA,
    reportedAt: new Date('2026-10-01'),
  },
  {
    ...incident,
    id: 'before',
    patrolSessionId: null,
    parkId: parkA,
    reportedAt: new Date('2026-08-31T23:59:59.999Z'),
  },
  {
    ...incident,
    id: 'resolved',
    patrolSessionId: null,
    parkId: parkA,
    status: 'RESOLVED',
    incidentType: 'OTHER',
    location: { latitude: 91, longitude: 0 },
  },
];
const alert = {
  createdAt: end,
  severity: 'HIGH',
  status: 'OPEN',
  source: 'COLLAR',
  alertType: 'CROP_RAID',
  location,
  acknowledgedBy: 'R-101',
  responses: [] as Array<{ action: string; respondedAt: Date }>,
};
const alerts = [
  { ...alert, parkId: parkA },
  { ...alert, parkId: parkB },
  { ...alert, parkId: parkB },
  { ...alert, parkId: null },
  {
    ...alert,
    parkId: parkA,
    severity: 'LOW',
    status: 'RESOLVED',
    source: 'COMMUNITY_REPORT',
    alertType: 'OTHER',
    location: null,
  },
  {
    ...alert,
    parkId: parkA,
    createdAt: new Date('2026-08-31'),
    responses: [
      { action: 'INVESTIGATED_AREA', respondedAt: end },
      { action: 'OTHER', respondedAt: new Date('2026-10-01') },
    ],
  },
  {
    ...alert,
    parkId: parkB,
    createdAt: new Date('2026-08-31'),
    responses: [{ action: 'OTHER', respondedAt: end }],
  },
  {
    ...alert,
    parkId: null,
    responses: [{ action: 'OTHER', respondedAt: end }],
  },
  { ...alert, parkId: parkA, createdAt: new Date('2026-10-01') },
];
beforeEach(() => {
  resetAnalyticsPrisma();
  jest.mocked(prisma.park.findUnique).mockImplementation(async (args) => ({
    id: String(args.where.id),
    name: String(args.where.id),
    code: 'TEST',
  }));
  jest
    .mocked(prisma.patrolRoute.findMany)
    .mockImplementation(async (args) =>
      routes.filter((row) => matches(row, args.where)),
    );
  jest
    .mocked(prisma.patrolSession.findMany)
    .mockImplementation(async (args) =>
      sessions.filter((row) => matches(row, args.where)),
    );
  jest
    .mocked(prisma.conservationIncident.findMany)
    .mockImplementation(async (args) =>
      incidents.filter((row) => matches(row, args.where)),
    );
  jest
    .mocked(prisma.wildlifeConflictAlert.findMany)
    .mockImplementation(async (args) =>
      alerts.filter((row) => matches(row, args.where)),
    );
});

test('park switching isolates all categories, retains explicit incidents, excludes legacy and honors inclusive UTC dates', async () => {
  const a = await getCriteriaAnalytics(criteria);
  const b = await getCriteriaAnalytics({ ...criteria, parkId: parkB });
  expect(a.incidentStatistics).toMatchObject({
    total: 3,
    byType: [
      { name: 'SNARE', count: 2 },
      { name: 'OTHER', count: 1 },
    ],
  });
  expect(a.incidentStatistics?.overTime.points.at(-1)?.count).toBe(3);
  expect(b.incidentStatistics?.total).toBe(1);
  expect(a.incidentHotspots).toMatchObject({
    validIncidentCount: 2,
    excludedCoordinateCount: 1,
    hotspots: [
      {
        incidentCount: 2,
        rank: 1,
        latitude: location.latitude,
        longitude: location.longitude,
      },
    ],
  });
  expect(b.incidentHotspots?.hotspots).toEqual([]); // Park A's cell cannot form Park B's hotspot.
  expect(a.patrolCoverage).toMatchObject({
    totalRoutes: 2,
    coveredRoutes: 1,
    neglectedRoutes: 1,
    coveragePercentage: 50,
    completedPatrolCount: 1,
  });
  expect(
    a.patrolCoverage?.routes.find((row) => row.routeId === 'route-a')
      ?.waypointCount,
  ).toBe(1);
  expect(b.patrolCoverage).toMatchObject({
    totalRoutes: 1,
    coveredRoutes: 0,
    limitedActivityRoutes: 1,
  });
  expect(a.conflictTrends).toMatchObject({
    scope: 'SELECTED_PARK',
    totalAlerts: 2,
    totalResponses: 1,
    responsesByAction: [{ name: 'INVESTIGATED_AREA', count: 1 }],
    locations: { validAlertCount: 1, excludedCoordinateCount: 1 },
  });
  expect(b.conflictTrends).toMatchObject({
    totalAlerts: 2,
    totalResponses: 1,
    locations: { locations: [{ alertCount: 2 }] },
  });
});

test('incident type/status/ranger filters narrow scope before both calculations', async () => {
  const result = await getCriteriaAnalytics({
    ...criteria,
    incidentType: 'SNARE',
    incidentStatus: 'REPORTED',
    rangerId: 'R-101',
  });
  expect(result.incidentStatistics?.total).toBe(2);
  expect(result.incidentHotspots?.hotspots[0].incidentCount).toBe(2);
  const empty = await getCriteriaAnalytics({
    ...criteria,
    categories: ['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS'],
    rangerId: 'nobody',
  });
  expect(empty.status).toBe('NO_MATCHING_DATA');
  expect(empty.incidentStatistics?.total).toBe(0);
  expect(empty.incidentHotspots?.hotspots).toEqual([]);
});

test.each([
  { severity: 'HIGH' },
  { conflictStatus: 'OPEN' },
  { conflictSource: 'COLLAR' },
  { conflictType: 'CROP_RAID' },
  {
    rangerId: 'R-101',
    severity: 'HIGH',
    conflictStatus: 'OPEN',
    conflictSource: 'COLLAR',
    conflictType: 'CROP_RAID',
  },
])(
  'HWC optional filters narrow assigned alerts and parent-scoped responses: %j',
  async (filters) => {
    const result = await getCriteriaAnalytics({
      ...criteria,
      categories: ['HWC_TRENDS'],
      ...filters,
    });
    expect(result.conflictTrends?.totalAlerts).toBe(1);
    expect(result.conflictTrends?.totalResponses).toBe(1);
    expect(result.conflictTrends?.locations.locations[0].alertCount).toBe(1);
  },
);

test('zero responses, response-only periods, and neglected-only periods retain meaningful analysis', async () => {
  const noResponses = await getCriteriaAnalytics({
    ...criteria,
    categories: ['HWC_TRENDS'],
    conflictStatus: 'RESOLVED',
  });
  expect(noResponses.status).toBe('DATA');
  expect(noResponses.conflictTrends).toMatchObject({
    totalAlerts: 1,
    totalResponses: 0,
  });
  const olderAlert = {
    ...alert,
    parkId: parkA,
    createdAt: new Date('2026-08-01'),
    responses: [
      { action: 'INVESTIGATED_AREA', respondedAt: new Date('2026-09-10') },
    ],
  };
  jest
    .mocked(prisma.wildlifeConflictAlert.findMany)
    .mockImplementation(async (args) =>
      [olderAlert].filter((row) => matches(row, args.where)),
    );
  const responseOnly = await getCriteriaAnalytics({
    ...criteria,
    categories: ['HWC_TRENDS'],
    start: '2026-09-10',
    end: '2026-09-10',
  });
  expect(responseOnly.status).toBe('DATA');
  expect(responseOnly.conflictTrends?.totalAlerts).toBe(0);
  expect(responseOnly.conflictTrends?.totalResponses).toBe(1);
  const neglected = await getCriteriaAnalytics({
    ...criteria,
    categories: ['PATROL_COVERAGE'],
    start: '2026-07-01',
    end: '2026-07-31',
  });
  expect(neglected.status).toBe('DATA');
  expect(neglected.patrolCoverage).toMatchObject({
    totalRoutes: 2,
    neglectedRoutes: 2,
    completedPatrolCount: 0,
    coveragePercentage: 0,
  });
});

test('conflict locations use a stable grid, deterministic ranks, singles and safe invalid-coordinate exclusion', () => {
  const rows = [
    { ...alert, location: { latitude: 1.15, longitude: -1.151 } },
    { ...alert, location: { latitude: 1.151, longitude: -1.152 } },
    { ...alert, location: { latitude: -1.15, longitude: 1.15 } },
    ...[
      null,
      {},
      { latitude: '1', longitude: 0 },
      { latitude: NaN, longitude: 0 },
      { latitude: 0, longitude: 181 },
    ].map((location) => ({ ...alert, location })),
  ];
  const result = calculateConflictLocations(rows);
  expect(result).toEqual(calculateConflictLocations([...rows].reverse()));
  expect(result).toMatchObject({
    validAlertCount: 3,
    excludedCoordinateCount: 5,
  });
  expect(
    result.locations.map((cell) => [cell.cellId, cell.alertCount, cell.rank]),
  ).toEqual([
    ['115:-116', 2, 1],
    ['-115:115', 1, 2],
  ]);
  expect(calculateConflictLocations([]).locations).toEqual([]);
});

test('adjacent cells with equal rounded representatives retain deterministic hotspot and conflict ranks', () => {
  const rows = [1.14999999, 1.14999999, 1.15000001, 1.15000001].map(latitude => ({
    ...alert, incidentType: 'SNARE', location: { latitude, longitude: 0 },
  }));
  expect(calculateIncidentHotspots(rows)).toEqual(calculateIncidentHotspots([...rows].reverse()));
  expect(calculateConflictLocations(rows)).toEqual(calculateConflictLocations([...rows].reverse()));
});

test('waypoints are deduplicated and date/lifecycle scoped even if retrieval supplies extra rows', () => {
  const result = calculatePatrolCoverage(
    routes.slice(0, 2),
    [
      {
        ...sessions[0],
        waypoints: [
          waypoint,
          waypoint,
          { ...waypoint, id: 'old', timestamp: new Date('2026-08-31') },
          { ...waypoint, id: 'invalid', latitude: 91 },
          { ...waypoint, id: 'future', timestamp: new Date('2026-10-01') },
        ],
      },
      sessions[0],
      sessions[2],
    ],
    new Date(criteria.start),
    end,
  );
  expect(result.patrolSessionCount).toBe(1);
  expect(
    result.routes.find((row) => row.routeId === 'route-a')?.waypointCount,
  ).toBe(1);
  expect(result.excludedSessionCount).toBe(1);
});
