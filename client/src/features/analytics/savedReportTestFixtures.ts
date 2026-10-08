import type { AnalysisCriteria } from '../../../../server/src/modules/analytics/contract';
import type { SavedStatisticalReport } from '../../../../server/src/modules/analytics/savedReportContract';
import { createReportSnapshot } from '../../../../server/src/modules/analytics/reportContract';
import { result, validCriteria } from './analyticsTestFixtures';

export function savedReportFixture(
  criteria: AnalysisCriteria = validCriteria,
): SavedStatisticalReport {
  return {
    ...createReportSnapshot(criteria, result(criteria)),
    id: 'c67a000000000000000000050',
    title: 'Statistical Conservation Report',
    notes: null,
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
    archivedAt: null,
    creatorId: null,
    version: 1,
    parentReportId: null,
  };
}
