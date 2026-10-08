import {
  CATEGORY_LABELS,
  type AnalyticsGroup,
  type AnalyticsTimeSeries,
  type AnalysisCategory,
  type AnalyticsResult,
} from './contract.js';
import { buildReportDocument, type DeepReadonly } from './reportContract.js';

export type ReportCell = string | number;
export interface ReportTable {
  title: string;
  columns: string[];
  rows: ReportCell[][];
}
export interface ReportTableSection {
  title: string;
  category?: AnalysisCategory;
  tables: ReportTable[];
}

const metrics = (rows: ReportCell[][]): ReportTable => ({
  title: 'Findings',
  columns: ['Measure', 'Value'],
  rows,
});
const groups = (
  title: string,
  values: DeepReadonly<AnalyticsGroup[]>,
): ReportTable => ({
  title,
  columns: ['Category', 'Count'],
  rows: values.map((item) => [item.name, item.count]),
});
const series = (
  title: string,
  values: DeepReadonly<AnalyticsTimeSeries>,
): ReportTable => ({
  title,
  columns: ['Bucket starts (UTC)', 'Bucket size', 'Count'],
  rows: values.points.map((item) => [item.date, values.bucket, item.count]),
});

// All tabular renderers consume the saved evidence. CSV/XLSX never query or
// recalculate live analytics, including location cells and zero time buckets.
export function buildReportTables(
  report: Parameters<typeof buildReportDocument>[0],
): ReportTableSection[] {
  const document = buildReportDocument(report);
  const sections: ReportTableSection[] = [
    {
      title: 'Summary',
      tables: [
        {
          title: 'Report metadata',
          columns: ['Field', 'Value'],
          rows: [
            ['Report ID', report.id ?? 'Unsaved'],
            ['Title', document.title],
            ['Version', report.version ?? 1],
            ['Park', report.park.name],
            ['Park code', report.park.code],
            ['Start Date', report.appliedCriteria.start],
            ['End Date (inclusive UTC)', report.appliedCriteria.end],
            ['Generated Date (UTC)', report.generatedAt],
            ['Metadata updated (UTC)', report.updatedAt ?? report.generatedAt],
            ['Previous version ID', report.parentReportId ?? 'None'],
            ['Manager notes', report.notes ?? 'None'],
          ],
        },
        {
          title: 'Selected categories',
          columns: ['Category'],
          rows: document.includes.map((value) => [value]),
        },
        {
          title: 'Applied scope and filters',
          columns: ['Criterion'],
          rows: document.scope.map((value) => [value]),
        },
        {
          title: 'Executive Summary',
          columns: ['Finding'],
          rows: document.summary.map((value) => [value]),
        },
        {
          title: 'Data Scope and Limitations',
          columns: ['Limitation'],
          rows: document.limitations.map((value) => [value]),
        },
      ],
    },
  ];
  const data = report.analyticsResult;
  for (const category of report.selectedCategories) {
    const tables: ReportTable[] = [];
    if (category === 'INCIDENT_STATISTICS' && data.incidentStatistics)
      tables.push(...incidentTables(data.incidentStatistics));
    if (category === 'INCIDENT_HOTSPOTS' && data.incidentHotspots)
      tables.push(...hotspotTables(data.incidentHotspots));
    if (category === 'PATROL_COVERAGE' && data.patrolCoverage)
      tables.push(...coverageTables(data.patrolCoverage));
    if (category === 'HWC_TRENDS' && data.conflictTrends)
      tables.push(...conflictTables(data.conflictTrends));
    sections.push({
      title:
        category === 'HWC_TRENDS' ? 'HWC Trends' : CATEGORY_LABELS[category],
      category,
      tables,
    });
  }
  return sections;
}

function incidentTables(
  value: NonNullable<DeepReadonly<AnalyticsResult>['incidentStatistics']>,
): ReportTable[] {
  return [
    metrics([['Total incidents', value.total]]),
    groups('Incidents by type', value.byType),
    groups('Incidents by status', value.byStatus),
    series('Incidents over time', value.overTime),
  ];
}

function hotspotTables(
  value: NonNullable<DeepReadonly<AnalyticsResult>['incidentHotspots']>,
): ReportTable[] {
  return [
    metrics([
      ['Hotspot count', value.hotspots.length],
      ['Grid size (degrees)', value.gridSizeDegrees],
      ['Minimum incidents', value.minimumIncidents],
      ['Valid coordinates', value.validIncidentCount],
      ['Excluded coordinates', value.excludedCoordinateCount],
      ['Isolated incidents', value.isolatedIncidentCount],
    ]),
    {
      title: 'Ranked hotspots',
      columns: [
        'Rank',
        'Cell ID',
        'Latitude',
        'Longitude',
        'Incidents',
        'Concentration',
      ],
      rows: value.hotspots.map((item) => [
        item.rank,
        item.cellId,
        item.latitude,
        item.longitude,
        item.incidentCount,
        item.concentration,
      ]),
    },
    {
      title: 'Hotspot incident types',
      columns: ['Cell ID', 'Type', 'Count'],
      rows: value.hotspots.flatMap((item) =>
        item.byType.map((group) => [item.cellId, group.name, group.count]),
      ),
    },
  ];
}

function coverageTables(
  value: NonNullable<DeepReadonly<AnalyticsResult>['patrolCoverage']>,
): ReportTable[] {
  return [
    metrics([
      ['Coverage percentage', value.coveragePercentage],
      ['Total routes', value.totalRoutes],
      ['Covered routes', value.coveredRoutes],
      ['Limited-activity routes', value.limitedActivityRoutes],
      ['Neglected routes', value.neglectedRoutes],
      ['Patrol sessions', value.patrolSessionCount],
      ['Completed patrols', value.completedPatrolCount],
      ['Excluded sessions', value.excludedSessionCount],
      ['Routes missing geometry', value.missingGeometryRouteCount],
    ]),
    {
      title: 'Patrol route coverage',
      columns: [
        'Route ID',
        'Route name',
        'Status',
        'Sessions',
        'Completed',
        'Waypoints',
        'Last activity (UTC)',
        'Geometry',
      ],
      rows: value.routes.map((item) => [
        item.routeId,
        item.routeName,
        item.status,
        item.sessionCount,
        item.completedSessionCount,
        item.waypointCount,
        item.lastPatrolDate ?? 'None',
        item.geometry ? 'Stored' : 'Unavailable',
      ]),
    },
    {
      title: 'Stored route coordinates',
      columns: ['Route ID', 'Point order', 'Longitude', 'Latitude'],
      rows: value.routes.flatMap(
        (item) =>
          item.geometry?.coordinates.map((point, index) => [
            item.routeId,
            index + 1,
            point[0],
            point[1],
          ]) ?? [],
      ),
    },
  ];
}

function conflictTables(
  value: NonNullable<DeepReadonly<AnalyticsResult>['conflictTrends']>,
): ReportTable[] {
  return [
    metrics([
      ['Total alerts', value.totalAlerts],
      ['Total responses', value.totalResponses],
      ['Location grid (degrees)', value.locations.gridSizeDegrees],
      ['Valid alert coordinates', value.locations.validAlertCount],
      ['Excluded alert coordinates', value.locations.excludedCoordinateCount],
    ]),
    {
      title: 'Conflict scope',
      columns: ['Notice'],
      rows: [[value.scopeNotice]],
    },
    series('Alerts over time', value.alertsOverTime),
    groups('Alerts by severity', value.bySeverity),
    groups('Alerts by status', value.byStatus),
    groups('Alerts by source', value.bySource),
    groups('Alerts by type', value.byType),
    groups('Responses by action', value.responsesByAction),
    series('Responses over time', value.responsesOverTime),
    {
      title: 'Conflict locations',
      columns: ['Rank', 'Cell ID', 'Latitude', 'Longitude', 'Alerts'],
      rows: value.locations.locations.map((item) => [
        item.rank,
        item.cellId,
        item.latitude,
        item.longitude,
        item.alertCount,
      ]),
    },
    {
      title: 'Conflict location breakdowns',
      columns: ['Cell ID', 'Breakdown', 'Category', 'Count'],
      rows: value.locations.locations.flatMap((item) => [
        ...item.bySeverity.map((group) => [
          item.cellId,
          'Severity',
          group.name,
          group.count,
        ]),
        ...item.byType.map((group) => [
          item.cellId,
          'Type',
          group.name,
          group.count,
        ]),
      ]),
    },
  ];
}
