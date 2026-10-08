import { calculateIncidentHotspots } from '../src/modules/analytics/hotspots.js';
import {
  calculateIncidentStatistics,
  calculateConflictTrends,
} from '../src/modules/analytics/calculations.js';
import { buildTimeSeries } from '../src/modules/analytics/timeSeries.js';

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-09-30T23:59:59.999Z');
const located = (
  latitude: unknown,
  longitude: unknown,
  incidentType = 'SNARE',
) => ({ incidentType, location: { latitude, longitude } });

describe('UC-D Batch 2 incident statistics', () => {
  test('counts real input rows by type, status and reported date, including quiet dates', () => {
    const statistics = calculateIncidentStatistics(
      [
        { incidentType: 'SNARE', status: 'REPORTED', reportedAt: start },
        { incidentType: 'SNARE', status: 'RESOLVED', reportedAt: end },
        { incidentType: 'OTHER', status: 'REPORTED', reportedAt: end },
      ],
      start,
      end,
    );
    expect(statistics.total).toBe(3);
    expect(statistics.byType).toEqual([
      { name: 'SNARE', count: 2 },
      { name: 'OTHER', count: 1 },
    ]);
    expect(statistics.byStatus).toEqual([
      { name: 'REPORTED', count: 2 },
      { name: 'RESOLVED', count: 1 },
    ]);
    expect(statistics.overTime.points).toHaveLength(30);
    expect(statistics.overTime.points[0]).toEqual({
      date: '2026-09-01',
      count: 1,
    });
    expect(statistics.overTime.points[1].count).toBe(0);
    expect(statistics.overTime.points[29]).toEqual({
      date: '2026-09-30',
      count: 2,
    });
  });
});

describe('UC-D deterministic hotspot grid', () => {
  test('groups nearby points, leaves separate cells apart and ranks by count', () => {
    const rows = [
      located(-2.151, 34.821),
      located(-2.152, 34.822, 'OTHER'),
      located(-2.153, 34.823),
      located(-2.181, 34.851),
      located(-2.182, 34.852),
      located(-3, 35),
    ];
    const analysis = calculateIncidentHotspots(rows);
    expect(analysis.hotspots.map((point) => point.incidentCount)).toEqual([
      3, 2,
    ]);
    expect(analysis.hotspots.map((point) => point.rank)).toEqual([1, 2]);
    expect(analysis.hotspots[0].latitude).toBeCloseTo(-2.152, 6);
    expect(analysis.hotspots[0].longitude).toBeCloseTo(34.822, 6);
    expect(analysis.hotspots[0].byType).toEqual([
      { name: 'SNARE', count: 2 },
      { name: 'OTHER', count: 1 },
    ]);
    expect(analysis.validIncidentCount).toBe(6);
    expect(analysis.isolatedIncidentCount).toBe(1);
    expect(calculateIncidentHotspots([...rows].reverse())).toEqual(analysis);
  });
  test('does not merge adjacent cells across an explicit grid boundary', () => {
    const analysis = calculateIncidentHotspots([
      located(1.0099, 2.001),
      located(1.0101, 2.001),
    ]);
    expect(analysis.hotspots).toEqual([]);
    expect(analysis.isolatedIncidentCount).toBe(2);
  });
  test('exact decimal boundaries are stable despite binary floating-point representation', () => {
    const analysis = calculateIncidentHotspots([
      located(1.15, 2.001),
      located(1.151, 2.001),
    ]);
    expect(analysis.hotspots).toHaveLength(1);
    expect(analysis.hotspots[0].incidentCount).toBe(2);
  });
  test('rejects malformed, missing, non-finite, out-of-range and string coordinates', () => {
    const analysis = calculateIncidentHotspots([
      { incidentType: 'SNARE' },
      { incidentType: 'OTHER', location: null },
      located(NaN, 2),
      located(1, Infinity),
      located(91, 2),
      located(1, -181),
      located('1', 2),
      located(0, 0),
      located(0, 0),
    ]);
    expect(analysis.excludedCoordinateCount).toBe(7);
    expect(analysis.hotspots[0]).toMatchObject({
      latitude: 0,
      longitude: 0,
      incidentCount: 2,
    });
  });
  test.each([
    [2, 'LOW'],
    [5, 'MEDIUM'],
    [10, 'HIGH'],
  ])('labels concentration from count %i as %s', (count, concentration) => {
    expect(
      calculateIncidentHotspots(
        Array.from({ length: count }, () => located(1.001, 2.001)),
      ).hotspots[0].concentration,
    ).toBe(concentration);
  });
  test('an empty dataset produces no fabricated hotspots', () => {
    expect(calculateIncidentHotspots([])).toMatchObject({
      hotspots: [],
      validIncidentCount: 0,
      excludedCoordinateCount: 0,
      isolatedIncidentCount: 0,
    });
  });
});

describe('UC-D calendar time buckets', () => {
  test('uses day buckets with inclusive endpoints and ignores dates outside the range or malformed dates', () => {
    const series = buildTimeSeries(
      [start, end, 'not-a-date', '2026-08-31', '2026-10-01'],
      start,
      end,
    );
    expect(series.bucket).toBe('DAY');
    expect(series.points.reduce((sum, point) => sum + point.count, 0)).toBe(2);
  });
  test('uses UTC Monday weeks, including a partial first week', () => {
    const series = buildTimeSeries(
      ['2026-09-01', '2026-09-06', '2026-09-07'],
      start,
      new Date('2026-10-31T23:59:59.999Z'),
    );
    expect(series.bucket).toBe('WEEK');
    expect(series.points[0]).toEqual({ date: '2026-08-31', count: 2 });
    expect(series.points[1]).toEqual({ date: '2026-09-07', count: 1 });
  });
  test('uses calendar months over longer periods and retains empty months', () => {
    const series = buildTimeSeries(
      ['2026-01-31', '2026-02-01'],
      new Date('2026-01-15'),
      new Date('2026-12-31T23:59:59.999Z'),
    );
    expect(series.bucket).toBe('MONTH');
    expect(series.points).toHaveLength(12);
    expect(series.points.slice(0, 3)).toEqual([
      { date: '2026-01-01', count: 1 },
      { date: '2026-02-01', count: 1 },
      { date: '2026-03-01', count: 0 },
    ]);
  });
  test('uses bounded year buckets for multi-year periods', () => {
    const series = buildTimeSeries(
      ['2024-02-29', '2026-01-01'],
      new Date('2024-01-01'),
      end,
    );
    expect(series.bucket).toBe('YEAR');
    expect(series.points).toEqual([
      { date: '2024-01-01', count: 1 },
      { date: '2025-01-01', count: 0 },
      { date: '2026-01-01', count: 1 },
    ]);
  });
  test('a same-day period includes both midnight and the end of the day', () => {
    const series = buildTimeSeries(
      [start, '2026-09-01T23:59:59.999Z'],
      start,
      new Date('2026-09-01T23:59:59.999Z'),
    );
    expect(series.points).toEqual([{ date: '2026-09-01', count: 2 }]);
  });
});

describe('UC-D conflict trends', () => {
  test('groups alert events, all four dimensions and independently dated response actions', () => {
    const trends = calculateConflictTrends(
      [
        {
          severity: 'HIGH',
          status: 'OPEN',
          source: 'COLLAR',
          alertType: 'CROP_RAID',
          createdAt: start,
        },
        {
          severity: 'HIGH',
          status: 'RESOLVED',
          source: 'COLLAR',
          alertType: 'CROP_RAID',
          createdAt: end,
        },
        {
          severity: 'LOW',
          status: 'OPEN',
          source: 'COMMUNITY_REPORT',
          alertType: 'OTHER',
          createdAt: end,
        },
      ],
      [
        { action: 'PATROL', respondedAt: start },
        { action: 'PATROL', respondedAt: end },
        { action: 'OTHER', respondedAt: end },
      ],
      start,
      end,
    );
    expect(trends.totalAlerts).toBe(3);
    expect(trends.bySeverity).toEqual([
      { name: 'HIGH', count: 2 },
      { name: 'LOW', count: 1 },
    ]);
    expect(trends.byStatus).toEqual([
      { name: 'OPEN', count: 2 },
      { name: 'RESOLVED', count: 1 },
    ]);
    expect(trends.bySource).toEqual([
      { name: 'COLLAR', count: 2 },
      { name: 'COMMUNITY_REPORT', count: 1 },
    ]);
    expect(trends.byType).toEqual([
      { name: 'CROP_RAID', count: 2 },
      { name: 'OTHER', count: 1 },
    ]);
    expect(trends.totalResponses).toBe(3);
    expect(trends.responsesByAction).toEqual([
      { name: 'PATROL', count: 2 },
      { name: 'OTHER', count: 1 },
    ]);
    expect(trends.alertsOverTime.points[29].count).toBe(2);
    expect(trends.responsesOverTime.points[0].count).toBe(1);
    expect(trends.scope).toBe('SELECTED_PARK');
    expect(trends.scopeNotice).toContain('assigned to the selected park');
  });
  test('no alerts/responses returns empty breakdowns and zero-filled time axes, not fabricated events', () => {
    const trends = calculateConflictTrends([], [], start, end);
    expect(trends.totalAlerts).toBe(0);
    expect(trends.totalResponses).toBe(0);
    expect(trends.bySeverity).toEqual([]);
    expect(trends.responsesByAction).toEqual([]);
    expect(
      trends.alertsOverTime.points.every((point) => point.count === 0),
    ).toBe(true);
  });
});
