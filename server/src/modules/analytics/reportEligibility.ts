import type { AnalyticsResult } from './contract.js';
import type { DeepReadonly } from './reportContract.js';

export function hasReportableFindings(
  data: DeepReadonly<AnalyticsResult> | undefined,
): boolean {
  if (!data || data.status !== 'DATA') return false;
  const selected = data.filters.categories;
  // A park with registered routes but no patrol activity still has meaningful
  // coverage findings: every route is neglected. Never fabricate sessions.
  return (
    (selected.some((category) => category.startsWith('INCIDENT_')) &&
      data.matchedRecords.incidents > 0) ||
    (selected.includes('PATROL_COVERAGE') &&
      ((data.patrolCoverage?.totalRoutes ?? 0) > 0 ||
        data.matchedRecords.patrols > 0)) ||
    (selected.includes('HWC_TRENDS') &&
      ((data.matchedRecords.conflicts ?? 0) > 0 ||
        (data.matchedRecords.responses ?? 0) > 0))
  );
}
