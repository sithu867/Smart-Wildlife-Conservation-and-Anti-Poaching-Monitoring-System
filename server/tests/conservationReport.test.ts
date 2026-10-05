import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { analyticsService } from '../src/modules/analytics/service.js';
import {
  calculateIncidentStatistics,
  calculateConflictTrends,
} from '../src/modules/analytics/calculations.js';
import { calculateIncidentHotspots } from '../src/modules/analytics/hotspots.js';
import { calculatePatrolCoverage } from '../src/modules/analytics/patrolCoverage.js';
import { analysisDateRange } from '../src/modules/analytics/validation.js';
import { validateReportSnapshot } from '../src/modules/analytics/reportValidation.js';
import { generateReportPdf } from '../src/modules/analytics/reportPdf.js';
import {
  buildReportDocument,
  reportFilename,
} from '../src/modules/analytics/reportContract.js';
import {
  ANALYSIS_CATEGORIES,
  CATEGORY_LABELS,
  HWC_SCOPE_NOTICE,
  type AnalysisCategory,
  type AnalyticsResult,
} from '../src/modules/analytics/contract.js';

const app = createApp();
function fixture(categories: AnalysisCategory[] = [...ANALYSIS_CATEGORIES]) {
  const criteria = {
    parkId: '67a000000000000000000001',
    start: '2026-09-01',
    end: '2026-09-30',
    categories,
    rangerId: 'R-101',
  };
  const park = {
    id: criteria.parkId,
    name: 'Reviewed Conservation Area',
    code: 'PARK-A',
  };
  const { start, end } = analysisDateRange(criteria);
  const incidentRows = Array.from({ length: 7 }, () => ({
    incidentType: 'SNARE',
    status: 'REPORTED',
    reportedAt: '2026-09-03',
    location: { latitude: -2.152, longitude: 34.822 },
  }));
  const selected = new Set(categories);
  const data: AnalyticsResult = {
    generatedAt: '2026-10-05T06:00:00.000Z',
    filters: criteria,
    park,
    status: 'DATA',
    matchedRecords: {
      incidents: categories.some((category) => category.startsWith('INCIDENT_'))
        ? 7
        : 0,
      patrols: selected.has('PATROL_COVERAGE') ? 1 : 0,
      ...(selected.has('HWC_TRENDS') ? { conflicts: 1, responses: 1 } : {}),
    },
    categoryAvailability: categories.map((category) => ({
      category,
      status: category === 'HWC_TRENDS' ? 'AVAILABLE_UNSCOPED' : 'AVAILABLE',
    })),
    limitations: selected.has('HWC_TRENDS') ? [HWC_SCOPE_NOTICE] : [],
    summary: {
      incidents: { total: 7 },
      patrols: { total: 1, completed: 1, active: 0 },
      conflicts: { total: 1, open: 1, resolved: 0 },
      responses: { total: 1 },
    },
    incidents: { byType: [], byStatus: [] },
    patrols: { byStatus: [], byRanger: [] },
    conflicts: { bySeverity: [], byStatus: [], bySource: [], byType: [] },
    responses: { byAction: [] },
    ...(selected.has('INCIDENT_STATISTICS')
      ? {
          incidentStatistics: calculateIncidentStatistics(
            incidentRows,
            start,
            end,
          ),
        }
      : {}),
    ...(selected.has('INCIDENT_HOTSPOTS')
      ? { incidentHotspots: calculateIncidentHotspots(incidentRows) }
      : {}),
    ...(selected.has('PATROL_COVERAGE')
      ? {
          patrolCoverage: calculatePatrolCoverage(
            [
              { _id: 'route-1', name: 'Reviewed covered route' },
              { _id: 'route-2', name: 'Reviewed neglected route' },
            ],
            [
              {
                patrolRoute: 'route-1',
                status: 'COMPLETED',
                startTime: '2026-09-02',
                endTime: '2026-09-03',
                waypoints: [],
              },
            ],
            start,
            end,
          ),
        }
      : {}),
    ...(selected.has('HWC_TRENDS')
      ? {
          conflictTrends: calculateConflictTrends(
            [
              {
                severity: 'HIGH',
                status: 'OPEN',
                source: 'COLLAR',
                alertType: 'CROP_RAID',
                createdAt: '2026-09-03',
              },
            ],
            [{ action: 'INVESTIGATED_AREA', respondedAt: '2026-09-04' }],
            start,
            end,
          ),
        }
      : {}),
  };
  return {
    generatedAt: '2026-10-05T06:10:00.000Z',
    park,
    appliedCriteria: criteria,
    selectedCategories: categories,
    analyticsResult: data,
  };
}
function post(path: string, snapshot: unknown) {
  return request(app)
    .post(`/api/analytics/reports${path}`)
    .set('x-user-role', 'MANAGER')
    .send(snapshot);
}
afterEach(() => jest.restoreAllMocks());

describe('UC-D report payload validation', () => {
  test('valid reviewed snapshot is accepted and retained verbatim, including empty optional controls', async () => {
    const snapshot = fixture();
    Object.assign(snapshot.appliedCriteria, { severity: '' });
    const response = await post('', snapshot);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(snapshot);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  test.each([
    [
      'missing scope',
      (value: ReturnType<typeof fixture>) => {
        Reflect.deleteProperty(value, 'appliedCriteria');
      },
    ],
    [
      'missing park',
      (value: ReturnType<typeof fixture>) => {
        Reflect.deleteProperty(value, 'park');
      },
    ],
    [
      'bad date range',
      (value: ReturnType<typeof fixture>) => {
        value.appliedCriteria.end = '2026-08-01';
      },
    ],
    [
      'invalid timestamp',
      (value: ReturnType<typeof fixture>) => {
        value.generatedAt = 'yesterday';
      },
    ],
    [
      'impossible timestamp',
      (value: ReturnType<typeof fixture>) => {
        value.generatedAt = '2026-02-30T06:00:00.000Z';
      },
    ],
    [
      'unsupported category',
      (value: ReturnType<typeof fixture>) => {
        Object.assign(value, { selectedCategories: ['UNKNOWN'] });
      },
    ],
    [
      'duplicate categories',
      (value: ReturnType<typeof fixture>) => {
        value.selectedCategories.push('INCIDENT_STATISTICS');
      },
    ],
    [
      'wrong selected categories',
      (value: ReturnType<typeof fixture>) => {
        value.selectedCategories = ['INCIDENT_STATISTICS'];
      },
    ],
    [
      'criteria differ from review',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.filters = {
          ...value.appliedCriteria,
          end: '2026-10-01',
        };
      },
    ],
    [
      'park differs from review',
      (value: ReturnType<typeof fixture>) => {
        value.park = { ...value.park, name: 'Another park' };
      },
    ],
    [
      'missing selected section',
      (value: ReturnType<typeof fixture>) => {
        Reflect.deleteProperty(value.analyticsResult, 'incidentStatistics');
      },
    ],
    [
      'negative total',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.incidentStatistics!.total = -1;
      },
    ],
    [
      'string count',
      (value: ReturnType<typeof fixture>) => {
        Object.assign(value.analyticsResult.incidentStatistics, { total: '7' });
      },
    ],
    [
      'inconsistent total',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.incidentStatistics!.total = 8;
      },
    ],
    [
      'contradictory incident breakdown',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.incidentStatistics!.byType[0].count = 99;
      },
    ],
    [
      'contradictory hotspot count',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.incidentHotspots!.hotspots[0].incidentCount = 1;
      },
    ],
    [
      'contradictory route status',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.patrolCoverage!.routes[0].status = 'NEGLECTED';
      },
    ],
    [
      'contradictory conflict breakdown',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.conflictTrends!.bySeverity[0].count = 99;
      },
    ],
    [
      'missing HWC scope limitation',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.conflictTrends!.scopeNotice = '';
      },
    ],
    [
      'malformed coordinates',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.incidentHotspots!.hotspots[0].latitude = 1000;
      },
    ],
    [
      'no matching data',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.status = 'NO_MATCHING_DATA';
      },
    ],
    [
      'fake DATA without matching records',
      (value: ReturnType<typeof fixture>) => {
        value.analyticsResult.matchedRecords = {
          incidents: 0,
          patrols: 0,
          conflicts: 0,
          responses: 0,
        };
      },
    ],
    [
      'unsupported field',
      (value: ReturnType<typeof fixture>) => {
        Object.assign(value, { unexpected: true });
      },
    ],
  ])(
    'generation and export reject %s with safe feedback',
    async (_name, mutate) => {
      const snapshot = fixture();
      mutate(snapshot);
      for (const path of ['', '/pdf']) {
        const response = await post(path, snapshot);
        expect(response.status).toBe(400);
        expect(response.body.error.message).toBe(
          'The report snapshot is invalid. Review the applied analysis and try again.',
        );
      }
    },
  );
  test('rejects unselected category content and unrelated matching records', () => {
    const snapshot = fixture(['INCIDENT_STATISTICS']);
    snapshot.analyticsResult.conflictTrends =
      fixture().analyticsResult.conflictTrends;
    expect(() => validateReportSnapshot(snapshot)).toThrow();
    const empty = fixture(['INCIDENT_STATISTICS']);
    empty.analyticsResult.matchedRecords = { incidents: 0, patrols: 10 };
    expect(() => validateReportSnapshot(empty)).toThrow();
  });
  test.each(['', '/pdf'])(
    'requires existing manager role for %s',
    async (path) => {
      const response = await request(app)
        .post(`/api/analytics/reports${path}`)
        .set('x-user-role', 'RANGER')
        .send(fixture());
      expect(response.status).toBe(403);
    },
  );
});

describe('UC-D PDF snapshot export', () => {
  test('returns valid PDF headers, title, reviewed scope, filters, selected categories and expected numbers', async () => {
    const snapshot = fixture();
    const response = await post('/pdf', snapshot);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="conservation-report-park-a-2026-10-05.pdf"',
    );
    const pdf = (response.body as Buffer).toString('ascii');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.endsWith('%%EOF')).toBe(true);
    for (const content of [
      'Statistical Conservation Report',
      'Reviewed Conservation Area',
      '2026-09-01 to 2026-09-30',
      'Ranger ID: R-101',
      'Total incidents: 7',
      'SNARE: 7',
      'Hotspot count: 1',
      'Covered routes: 1',
      'Neglected routes: 1',
      'Total alerts: 1',
      'Total responses: 1',
    ]) {
      expect(pdf).toContain(content);
    }
    ANALYSIS_CATEGORIES.forEach((category) =>
      expect(pdf).toContain(CATEGORY_LABELS[category]),
    );
    // Wrapped PDF prose is checked after extracting text operands, as viewers do.
    expect(extractPdfText(pdf)).toContain(HWC_SCOPE_NOTICE);
    expect(extractPdfText(pdf)).toContain(
      'Generated: 2026-10-05T06:10:00.000Z',
    );
    expect(pdf).toContain('Page 1 of');
  });
  test.each(ANALYSIS_CATEGORIES)(
    '%s export includes only its selected category',
    (category) => {
      const snapshot = fixture([category]);
      const pdf = generateReportPdf(validateReportSnapshot(snapshot)).toString(
        'ascii',
      );
      expect(pdf).toContain(CATEGORY_LABELS[category]);
      for (const other of ANALYSIS_CATEGORIES)
        if (other !== category)
          expect(pdf).not.toContain(CATEGORY_LABELS[other]);
      expect(
        buildReportDocument(snapshot).sections.map((section) => section.title),
      ).toEqual([CATEGORY_LABELS[category]]);
    },
  );
  test('generation and repeated exports do not query or recalculate analytics', async () => {
    const analyze = jest
      .spyOn(analyticsService, 'getAnalytics')
      .mockRejectedValue(new Error('Report must not query analytics'));
    const legacy = jest
      .spyOn(analyticsService, 'getLegacyAnalytics')
      .mockRejectedValue(new Error('Report must not query legacy analytics'));
    const generated = await post('', fixture());
    const first = await post('/pdf', generated.body.data);
    const retry = await post('/pdf', generated.body.data);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(first.body).toEqual(retry.body);
    expect(analyze).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
  });
  test('multi-page sections and unbroken long filters wrap within margins and retain every finding', () => {
    const snapshot = fixture(['PATROL_COVERAGE']);
    const coverage = snapshot.analyticsResult.patrolCoverage!;
    coverage.routes = Array.from({ length: 180 }, (_, index) => ({
      ...coverage.routes[0],
      routeId: `route-${index}`,
      routeName: `Route ${index} ${'longname'.repeat(30)}`,
    }));
    coverage.totalRoutes = 180;
    coverage.coveredRoutes = 180;
    coverage.neglectedRoutes = 0;
    coverage.coveragePercentage = 100;
    coverage.patrolSessionCount = 180;
    coverage.completedPatrolCount = 180;
    snapshot.analyticsResult.matchedRecords.patrols = 180;
    snapshot.appliedCriteria.rangerId = 'R'.repeat(700);
    const pdf = generateReportPdf(validateReportSnapshot(snapshot)).toString(
      'ascii',
    );
    const pageCount = Number(pdf.match(/\/Type \/Pages .*?\/Count (\d+)/)?.[1]);
    expect(pageCount).toBeGreaterThan(5);
    expect(pdf).toContain(`Page ${pageCount} of ${pageCount}`);
    expect(pdf).toContain('Route 179');
    for (const match of pdf.matchAll(
      /\/F[12] (\d+) Tf 48 (\d+) Td \((.*)\) Tj/g,
    )) {
      const size = Number(match[1]);
      const y = Number(match[2]);
      expect(y).toBeGreaterThanOrEqual(28);
      expect(y).toBeLessThanOrEqual(752);
      expect(unescapePdfText(match[3]).length * size * 0.6).toBeLessThanOrEqual(
        516,
      );
    }
    // Verify each xref offset points to its own object and each stream length is exact.
    const xref = pdf.slice(pdf.indexOf('xref\n')).split('\n');
    const entries = xref.slice(3, 3 + Number(xref[1].split(' ')[1]) - 1);
    entries.forEach((entry, index) =>
      expect(pdf.slice(Number(entry.slice(0, 10)))).toMatch(
        new RegExp(`^${index + 1} 0 obj`),
      ),
    );
    for (const match of pdf.matchAll(
      /\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g,
    ))
      expect(Buffer.byteLength(match[2], 'ascii')).toBe(Number(match[1]));
  });
  test('filenames and download headers safely handle hostile park code characters', async () => {
    const snapshot = fixture(['INCIDENT_STATISTICS']);
    snapshot.park.code = '../Park "name"\r\nX-Injected: yes/../../';
    const filename = reportFilename(snapshot);
    expect(filename).toMatch(
      /^conservation-report-[a-z0-9_-]+-2026-10-05\.pdf$/,
    );
    expect(filename).not.toMatch(/[\r\n"/\\]/);
    const response = await post('/pdf', snapshot);
    expect(response.status).toBe(200);
    expect(response.headers['x-injected']).toBeUndefined();
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${filename}"`,
    );
  });
});

function unescapePdfText(value: string) {
  return value.replace(/\\([\\()])/g, '$1');
}
function extractPdfText(pdf: string) {
  return [...pdf.matchAll(/Td \(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((match) => unescapePdfText(match[1]))
    .join(' ');
}
