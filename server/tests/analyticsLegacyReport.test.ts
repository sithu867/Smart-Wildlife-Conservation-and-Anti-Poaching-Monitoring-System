import { jest } from '@jest/globals';
import request from 'supertest';
import { prisma, resetAnalyticsPrisma } from './analyticsPrismaMock.js';

const { createApp } = await import('../src/app.js');
const { analyticsService } = await import('../src/modules/analytics/service.js');

// UC-D legacy (unscoped) analytics summary behind GET /api/analytics/report without park criteria:
// counting, grouping, date and ranger filters, and the inclusive response-date window. Prisma is mocked.
const app = createApp();
const START = new Date('2026-10-01T00:00:00.000Z');
const END = new Date('2026-10-07T23:59:59.999Z');
const patrol = (status: string, rangerName = 'Ranger John') => ({ id: `p-${status}-${rangerName}`, status, rangerName, waypoints: [] });
const incident = (incidentType: string, status = 'REPORTED') => ({ incidentType, status, reportedAt: START, location: {} });
const alert = (overrides: Record<string, unknown> = {}) => ({ severity: 'HIGH', status: 'OPEN', source: 'COLLAR', alertType: 'CROP_RAID', createdAt: START, responses: [], ...overrides });
const where = (mock: { mock: { calls: unknown[][] } }) => (mock.mock.calls[0][0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  resetAnalyticsPrisma();
  prisma.patrolSession.findMany.mockResolvedValue([]);
  prisma.conservationIncident.findMany.mockResolvedValue([]);
  prisma.wildlifeConflictAlert.findMany.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('getLegacyAnalytics', () => {
  test('summarises patrols, incidents, conflicts and responses and groups them by type, status, ranger and action', async () => {
    prisma.patrolSession.findMany.mockResolvedValue([patrol('COMPLETED'), patrol('COMPLETED', 'Ranger Amal'), patrol('ACTIVE'), patrol('CANCELLED')]);
    prisma.conservationIncident.findMany.mockResolvedValue([incident('SNARE'), incident('SNARE', 'RESOLVED'), incident('ANIMAL_CARCASS')]);
    prisma.wildlifeConflictAlert.findMany.mockResolvedValue([
      alert({ responses: [{ action: 'WARNED_COMMUNITY', respondedAt: START }, { action: 'SECURED_AREA', respondedAt: START }] }),
      alert({ status: 'ACKNOWLEDGED', source: 'COMMUNITY_REPORT', severity: 'LOW' }),
      alert({ status: 'RESOLVED', responses: [{ action: 'WARNED_COMMUNITY', respondedAt: START }] }),
      alert({ status: 'CANCELLED', alertType: 'LIVESTOCK_THREAT' })
    ]);

    const result = await analyticsService.getLegacyAnalytics();

    expect(result.summary).toEqual({
      patrols: { total: 4, completed: 2, active: 1 },
      incidents: { total: 3 },
      conflicts: { total: 4, open: 2, resolved: 1 },
      responses: { total: 3 }
    });
    expect(result.patrols.byRanger).toEqual([{ name: 'Ranger John', count: 3 }, { name: 'Ranger Amal', count: 1 }]);
    expect(result.incidents.byType).toEqual([{ name: 'SNARE', count: 2 }, { name: 'ANIMAL_CARCASS', count: 1 }]);
    expect(result.conflicts.bySource).toEqual([{ name: 'COLLAR', count: 3 }, { name: 'COMMUNITY_REPORT', count: 1 }]);
    expect(result.conflicts.byType).toEqual([{ name: 'CROP_RAID', count: 3 }, { name: 'LIVESTOCK_THREAT', count: 1 }]);
    expect(result.responses.byAction).toEqual([{ name: 'WARNED_COMMUNITY', count: 2 }, { name: 'SECURED_AREA', count: 1 }]);
  });

  test('without filters no date or ranger condition is applied, and withdrawn incidents are always excluded', async () => {
    await analyticsService.getLegacyAnalytics();
    expect(where(prisma.patrolSession.findMany)).toEqual({ rangerId: undefined });
    expect(where(prisma.conservationIncident.findMany)).toEqual({ deletedAt: null, reportedBy: undefined, incidentType: undefined, status: undefined });
    expect(where(prisma.wildlifeConflictAlert.findMany)).toEqual({ acknowledgedBy: undefined, severity: undefined, status: undefined, source: undefined, alertType: undefined });
  });

  test('a date range and ranger filter each records source on its own date field and ranger column', async () => {
    await analyticsService.getLegacyAnalytics({ start: START, end: END, rangerId: 'R-7', incidentType: 'SNARE', severity: 'HIGH', conflictSource: 'COLLAR' });

    expect(where(prisma.patrolSession.findMany)).toEqual({ startTime: { gte: START, lte: END }, rangerId: 'R-7' });
    expect(where(prisma.conservationIncident.findMany)).toMatchObject({ deletedAt: null, reportedAt: { gte: START, lte: END }, reportedBy: 'R-7', incidentType: 'SNARE' });
    expect(where(prisma.wildlifeConflictAlert.findMany)).toMatchObject({ createdAt: { gte: START, lte: END }, acknowledgedBy: 'R-7', severity: 'HIGH', source: 'COLLAR' });
  });

  test('an open-ended range applies only the bound that was given', async () => {
    await analyticsService.getLegacyAnalytics({ start: START });
    expect(where(prisma.patrolSession.findMany).startTime).toEqual({ gte: START });
    prisma.patrolSession.findMany.mockClear();
    await analyticsService.getLegacyAnalytics({ end: END });
    expect(where(prisma.patrolSession.findMany).startTime).toEqual({ lte: END });
  });

  test('responses count only inside the date range, with both boundaries inclusive', async () => {
    prisma.wildlifeConflictAlert.findMany.mockResolvedValue([
      alert({
        responses: [
          { action: 'A_BEFORE', respondedAt: new Date(START.getTime() - 1) },
          { action: 'B_AT_START', respondedAt: START },
          { action: 'C_AT_END', respondedAt: END },
          { action: 'D_AFTER', respondedAt: new Date(END.getTime() + 1) }
        ]
      })
    ]);

    const result = await analyticsService.getLegacyAnalytics({ start: START, end: END });

    expect(result.summary.responses.total).toBe(2);
    expect(result.responses.byAction.map(group => group.name)).toEqual(['B_AT_START', 'C_AT_END']);
  });

  test('no matching records gives zero totals and empty groups', async () => {
    const result = await analyticsService.getLegacyAnalytics({ start: START, end: END });
    expect(result.summary).toEqual({ patrols: { total: 0, completed: 0, active: 0 }, incidents: { total: 0 }, conflicts: { total: 0, open: 0, resolved: 0 }, responses: { total: 0 } });
    expect(result.conflicts.bySeverity).toEqual([]);
    expect(result.filters).toEqual({ start: START, end: END });
  });

  test('a single record is counted once in every grouping; a missing group value is reported as UNKNOWN', async () => {
    prisma.patrolSession.findMany.mockResolvedValue([{ id: 'p-1', status: 'ACTIVE', waypoints: [] }]);
    const result = await analyticsService.getLegacyAnalytics();
    expect(result.summary.patrols).toEqual({ total: 1, completed: 0, active: 1 });
    expect(result.patrols.byStatus).toEqual([{ name: 'ACTIVE', count: 1 }]);
    expect(result.patrols.byRanger).toEqual([{ name: 'UNKNOWN', count: 1 }]);
  });

  test('a data retrieval failure is passed to the caller', async () => {
    prisma.conservationIncident.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(analyticsService.getLegacyAnalytics()).rejects.toThrow('connection refused');
  });
});

describe('GET /api/analytics/report (legacy, unscoped)', () => {
  test('a manager receives a PDF built from the legacy summary, with calendar dates expanded to whole days', async () => {
    const legacy = jest.spyOn(analyticsService, 'getLegacyAnalytics');
    prisma.patrolSession.findMany.mockResolvedValue([patrol('COMPLETED')]);

    const res = await request(app)
      .get('/api/analytics/report')
      .set('x-user-role', 'MANAGER')
      .query({ start: '2026-10-01', end: '2026-10-07' })
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="conservation-report.pdf"');
    expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect(legacy).toHaveBeenCalledWith(expect.objectContaining({ start: START, end: END }));
  });

  test('a start date after the end date is rejected with 400 before any query', async () => {
    const res = await request(app).get('/api/analytics/report').set('x-user-role', 'MANAGER').query({ start: '2026-10-08', end: '2026-10-07' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Start Date must be on or before End Date.');
    expect(prisma.patrolSession.findMany).not.toHaveBeenCalled();
  });

  test('a database failure is a 500 with a generic message that does not expose the internal error', async () => {
    prisma.wildlifeConflictAlert.findMany.mockRejectedValue(new Error('password authentication failed for user neondb_owner'));
    const res = await request(app).get('/api/analytics/report').set('x-user-role', 'MANAGER');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: { message: 'Unable to analyze conservation data. Please try again.' } });
    expect(JSON.stringify(res.body)).not.toContain('neondb_owner');
  });
});
