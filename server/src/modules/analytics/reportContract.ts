import {
  CATEGORY_LABELS,
  HWC_SCOPE_NOTICE,
  PATROL_COVERAGE_LABELS,
  type AnalysisCategory,
  type AnalysisCriteria,
  type AnalyticsGroup,
  type AnalyticsResult,
  type AnalyticsTimeSeries,
  type ParkOption,
} from './contract.js';

export type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type ConservationReportSnapshot = DeepReadonly<{
  generatedAt: string;
  park: ParkOption;
  appliedCriteria: AnalysisCriteria;
  selectedCategories: AnalysisCategory[];
  analyticsResult: AnalyticsResult;
}>;

export function matchesReviewedReportScope(
  criteria: AnalysisCriteria,
  data: AnalyticsResult,
): boolean {
  // Empty optional form controls and absent query parameters have the same
  // meaning. Category order and every active filter must still match exactly.
  const identity = (value: AnalysisCriteria) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, entry]) => entry !== '' && entry !== undefined)
        .map(([key, entry]) => [
          key,
          key === 'rangerId' && typeof entry === 'string'
            ? entry.trim()
            : entry,
        ])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
  const sections = {
    INCIDENT_STATISTICS: data.incidentStatistics,
    INCIDENT_HOTSPOTS: data.incidentHotspots,
    PATROL_COVERAGE: data.patrolCoverage,
    HWC_TRENDS: data.conflictTrends,
  };
  return (
    identity(criteria) === identity(data.filters) &&
    criteria.parkId === data.park.id &&
    criteria.categories.every((category) => sections[category] !== undefined)
  );
}

export function retainReportSnapshot<T>(value: T): DeepReadonly<T> {
  // Detach every nested array/object from the reviewed analysis and freeze it.
  // Draft edits and subsequent result replacement cannot mutate a retained report.
  const copy: T = JSON.parse(JSON.stringify(value));
  function freeze(item: unknown): void {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy as DeepReadonly<T>;
}

export function createReportSnapshot(
  appliedCriteria: AnalysisCriteria,
  analyticsResult: AnalyticsResult,
): ConservationReportSnapshot {
  return retainReportSnapshot({
    generatedAt: new Date().toISOString(),
    park: analyticsResult.park,
    appliedCriteria,
    selectedCategories: appliedCriteria.categories,
    analyticsResult,
  });
}

export interface ReportSection {
  title: string;
  lines: string[];
}
export interface ConservationReportDocument {
  title: string;
  header: string[];
  includes: string[];
  scope: string[];
  summary: string[];
  sections: ReportSection[];
  limitations: string[];
}

const filterLabels: Record<string, string> = {
  rangerId: 'Ranger ID',
  incidentType: 'Incident type',
  incidentStatus: 'Incident status',
  severity: 'Alert severity',
  conflictStatus: 'Alert status',
  conflictSource: 'Alert source',
  conflictType: 'Conflict type',
};

function groupLines(
  label: string,
  groups: DeepReadonly<AnalyticsGroup[]>,
): string[] {
  return [
    `${label}:`,
    ...(groups.length
      ? groups.map((group) => `${group.name}: ${group.count}`)
      : ['No matching records in this breakdown.']),
  ];
}
function timeLines(
  label: string,
  series: DeepReadonly<AnalyticsTimeSeries>,
): string[] {
  // Keep the reviewed buckets, including zero counts; do not re-bin or query data.
  return [
    `${label} (${series.bucket.toLowerCase()} buckets):`,
    ...series.points.map((point) => `${point.date}: ${point.count}`),
  ];
}

export function buildReportDocument(
  report: ConservationReportSnapshot,
): ConservationReportDocument {
  // One presentation model supplies both preview and PDF, so selected sections,
  // findings and analytical values cannot diverge between the two renderers.
  const criteria = report.appliedCriteria;
  const data = report.analyticsResult;
  const includes = report.selectedCategories.map(
    (category) => CATEGORY_LABELS[category],
  );
  const scope = [
    `Start Date: ${criteria.start}`,
    `End Date: ${criteria.end} (inclusive, UTC)`,
  ];
  const activeFilters = Object.entries(filterLabels).flatMap(([key, label]) => {
    const value = criteria[key as keyof AnalysisCriteria];
    const relevant =
      key === 'rangerId' ||
      (key.startsWith('incident')
        ? report.selectedCategories.some((category) =>
            category.startsWith('INCIDENT_'),
          )
        : report.selectedCategories.includes('HWC_TRENDS'));
    return value && relevant ? [`${label}: ${value}`] : [];
  });
  scope.push(
    ...(activeFilters.length
      ? activeFilters
      : ['Advanced filters: All available records']),
  );
  const summary: string[] = [];
  const sections: ReportSection[] = [];
  for (const category of report.selectedCategories) {
    const lines: string[] = [];
    if (category === 'INCIDENT_STATISTICS' && data.incidentStatistics) {
      const statistics = data.incidentStatistics;
      summary.push(`Total incidents: ${statistics.total}`);
      lines.push(
        `Total incidents: ${statistics.total}`,
        ...groupLines('Incidents by type', statistics.byType),
        ...groupLines('Incidents by status', statistics.byStatus),
        ...timeLines('Incidents over time', statistics.overTime),
      );
    }
    if (category === 'INCIDENT_HOTSPOTS' && data.incidentHotspots) {
      const hotspots = data.incidentHotspots;
      summary.push(`Hotspot count: ${hotspots.hotspots.length}`);
      lines.push(
        `Hotspot count: ${hotspots.hotspots.length}`,
        `Grid: ${hotspots.gridSizeDegrees} degrees; minimum incidents per hotspot: ${hotspots.minimumIncidents}`,
        `Valid coordinates: ${hotspots.validIncidentCount}; excluded coordinates: ${hotspots.excludedCoordinateCount}; isolated incidents: ${hotspots.isolatedIncidentCount}`,
        ...(hotspots.hotspots.length
          ? hotspots.hotspots.map(
              (hotspot) =>
                `Rank ${hotspot.rank}: ${hotspot.latitude.toFixed(5)}, ${hotspot.longitude.toFixed(5)} | ${hotspot.concentration} concentration | ${hotspot.incidentCount} incidents`,
            )
          : ['No concentrated hotspots in the reviewed incident data.']),
      );
    }
    if (category === 'PATROL_COVERAGE' && data.patrolCoverage) {
      const coverage = data.patrolCoverage;
      summary.push(
        `Patrol coverage: ${coverage.coveragePercentage}% (${coverage.coveredRoutes} of ${coverage.totalRoutes} routes covered)`,
      );
      lines.push(
        `Coverage percentage: ${coverage.coveragePercentage}%`,
        `Total routes: ${coverage.totalRoutes}`,
        `Covered routes: ${coverage.coveredRoutes}`,
        `Limited-activity routes: ${coverage.limitedActivityRoutes}`,
        `Neglected routes: ${coverage.neglectedRoutes}`,
        `Patrol sessions: ${coverage.patrolSessionCount}; completed patrols: ${coverage.completedPatrolCount}`,
        ...coverage.routes.map(
          (route) =>
            `${route.routeName}: ${PATROL_COVERAGE_LABELS[route.status]} | Sessions: ${route.sessionCount}; completed: ${route.completedSessionCount}; waypoints: ${route.waypointCount}; last patrol: ${route.lastPatrolDate ?? 'None'}`,
        ),
      );
    }
    if (category === 'HWC_TRENDS' && data.conflictTrends) {
      const trends = data.conflictTrends;
      summary.push(
        `Conflict alerts: ${trends.totalAlerts}; responses recorded: ${trends.totalResponses}`,
      );
      lines.push(
        HWC_SCOPE_NOTICE,
        `Total alerts: ${trends.totalAlerts}`,
        ...timeLines('Alerts over time', trends.alertsOverTime),
        ...groupLines('Alerts by severity', trends.bySeverity),
        ...groupLines('Alerts by status', trends.byStatus),
        ...groupLines('Alerts by source', trends.bySource),
        ...groupLines('Alerts by type', trends.byType),
        `Total responses: ${trends.totalResponses}`,
        ...groupLines('Responses by action', trends.responsesByAction),
        ...timeLines('Responses over time', trends.responsesOverTime),
      );
    }
    sections.push({ title: CATEGORY_LABELS[category], lines });
  }
  return {
    title: 'Statistical Conservation Report',
    header: [
      `Park / Conservation Area: ${report.park.name} (${report.park.code})`,
      `Period: ${criteria.start} to ${criteria.end}`,
      `Generated: ${report.generatedAt}`,
    ],
    includes,
    scope,
    summary,
    sections,
    limitations: [...data.limitations],
  };
}

export function reportFilename(report: ConservationReportSnapshot): string {
  const code =
    report.park.code
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'park';
  return `conservation-report-${code}-${report.generatedAt.slice(0, 10)}.pdf`;
}
