// UC-D: a statistical report may only be generated or saved when the selected
// categories produced findings for exactly the criteria the manager reviewed.
import { hasReportableFindings } from '../src/modules/analytics/reportEligibility.js';
import { matchesReviewedReportScope } from '../src/modules/analytics/reportContract.js';
import type { AnalysisCategory, AnalysisCriteria, AnalyticsResult } from '../src/modules/analytics/contract.js';

function result(
  categories: AnalysisCategory[],
  matched: AnalyticsResult['matchedRecords'],
  extra: Partial<AnalyticsResult> = {},
): AnalyticsResult {
  return {
    status: 'DATA',
    filters: { categories },
    matchedRecords: matched,
    ...extra,
  } as unknown as AnalyticsResult;
}

const none = { incidents: 0, patrols: 0, conflicts: 0, responses: 0 };

describe('hasReportableFindings', () => {
  test('no analysis result is not reportable', () => {
    expect(hasReportableFindings(undefined)).toBe(false);
  });

  test('a NO_MATCHING_DATA result is not reportable even if counts are present', () => {
    expect(
      hasReportableFindings(result(['INCIDENT_STATISTICS'], { ...none, incidents: 3 }, { status: 'NO_MATCHING_DATA' })),
    ).toBe(false);
  });

  test.each<AnalysisCategory>(['INCIDENT_STATISTICS', 'INCIDENT_HOTSPOTS'])(
    'selected %s with matched incidents is reportable',
    (category) => {
      expect(hasReportableFindings(result([category], { ...none, incidents: 1 }))).toBe(true);
    },
  );

  test('incidents that match but were not selected do not make the report eligible', () => {
    expect(hasReportableFindings(result(['HWC_TRENDS'], { ...none, incidents: 5 }))).toBe(false);
  });

  test('patrol coverage with registered routes but no sessions is reportable (every route is neglected)', () => {
    expect(
      hasReportableFindings(
        result(['PATROL_COVERAGE'], none, { patrolCoverage: { totalRoutes: 2 } } as Partial<AnalyticsResult>),
      ),
    ).toBe(true);
  });

  test('patrol coverage with sessions but no coverage block is reportable', () => {
    expect(hasReportableFindings(result(['PATROL_COVERAGE'], { ...none, patrols: 4 }))).toBe(true);
  });

  test('patrol coverage with no routes and no sessions is not reportable', () => {
    expect(
      hasReportableFindings(
        result(['PATROL_COVERAGE'], none, { patrolCoverage: { totalRoutes: 0 } } as Partial<AnalyticsResult>),
      ),
    ).toBe(false);
  });

  test.each([
    ['conflicts only', { ...none, conflicts: 1 }],
    ['responses only', { ...none, responses: 2 }],
  ])('conflict trends with %s are reportable', (_label, matched) => {
    expect(hasReportableFindings(result(['HWC_TRENDS'], matched))).toBe(true);
  });

  test('conflict trends without conflict or response counts (older results) are not reportable', () => {
    expect(hasReportableFindings(result(['HWC_TRENDS'], { incidents: 0, patrols: 0 }))).toBe(false);
  });

  test('several categories: one category with findings is enough', () => {
    expect(
      hasReportableFindings(result(['INCIDENT_STATISTICS', 'PATROL_COVERAGE', 'HWC_TRENDS'], { ...none, responses: 1 })),
    ).toBe(true);
  });
});

// The client enables "Generate Report" only when the analysis on screen was
// produced for exactly the criteria the manager reviewed.
describe('matchesReviewedReportScope', () => {
  const parkId = 'c67a000000000000000000001';
  const criteria = {
    parkId,
    start: '2026-09-01',
    end: '2026-09-30',
    categories: ['INCIDENT_STATISTICS', 'PATROL_COVERAGE'],
    rangerId: 'R-101',
  } as AnalysisCriteria;
  const analysis = (filters: object, extra: object = {}) =>
    ({
      status: 'DATA',
      park: { id: parkId, name: 'Yala', code: 'YAL' },
      filters,
      incidentStatistics: { total: 1 },
      patrolCoverage: { totalRoutes: 1 },
      ...extra,
    }) as unknown as AnalyticsResult;

  test('identical criteria and all selected sections present match', () => {
    expect(matchesReviewedReportScope(criteria, analysis({ ...criteria }))).toBe(true);
  });

  test('blank optional controls equal absent parameters, key order and ranger whitespace do not matter', () => {
    const fromForm = { ...criteria, rangerId: '  R-101 ', severity: '' } as AnalysisCriteria;
    const { parkId: p, ...rest } = criteria;
    expect(matchesReviewedReportScope(fromForm, analysis({ ...rest, parkId: p }))).toBe(true);
  });

  test('a different active filter does not match', () => {
    expect(matchesReviewedReportScope(criteria, analysis({ ...criteria, rangerId: 'R-202' }))).toBe(false);
  });

  test('a different date range does not match', () => {
    expect(matchesReviewedReportScope(criteria, analysis({ ...criteria, end: '2026-09-29' }))).toBe(false);
  });

  test('category order must match the reviewed selection', () => {
    expect(
      matchesReviewedReportScope(
        criteria,
        analysis({ ...criteria, categories: ['PATROL_COVERAGE', 'INCIDENT_STATISTICS'] }),
      ),
    ).toBe(false);
  });

  test('results for another park do not match even with the same filters', () => {
    expect(
      matchesReviewedReportScope(criteria, analysis({ ...criteria }, { park: { id: 'c67a000000000000000000002' } })),
    ).toBe(false);
  });

  test('a selected category whose section is missing does not match', () => {
    expect(matchesReviewedReportScope(criteria, analysis({ ...criteria }, { patrolCoverage: undefined }))).toBe(false);
  });
});
