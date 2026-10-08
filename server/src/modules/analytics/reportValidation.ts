import { z } from 'zod';
import {
  ANALYSIS_CATEGORIES,
  HWC_SCOPE_NOTICE,
  isValidAnalysisDate,
  PATROL_COVERAGE_STATUSES,
  normalizeAnalysisControls,
} from './contract.js';
import {
  storedAnalysisCriteriaSchema,
  analysisParkIdSchema,
} from './validation.js';
import type { ConservationReportSnapshot } from './reportContract.js';
import { hasReportableFindings } from './reportEligibility.js';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().min(1).max(2000);
const timestamp = z
  .string()
  .datetime()
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) &&
      isValidAnalysisDate(value.slice(0, 10)),
  );
const calendarDate = z.string().refine(isValidAnalysisDate);
const groups = z.array(z.object({ name: text, count }).strict()).max(10000);
const series = z
  .object({
    bucket: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
    points: z
      .array(z.object({ date: calendarDate, count }).strict())
      .max(10000),
  })
  .strict();
// The form retains empty optional controls. Validate their normalized meaning
// while retaining the original payload verbatim after successful validation.
const criteria = z.preprocess(
  normalizeAnalysisControls,
  // Reading immutable evidence must not reapply a moving current-day policy.
  // New analyses and versions still pass the authoritative live criteria schema.
  storedAnalysisCriteriaSchema,
);
const park = z
  .object({ id: analysisParkIdSchema, name: text, code: text })
  .strict();
const statistics = z
  .object({ total: count, byType: groups, byStatus: groups, overTime: series })
  .strict();
const hotspots = z
  .object({
    gridSizeDegrees: z.number().positive().max(180),
    minimumIncidents: count.refine((value) => value >= 2),
    validIncidentCount: count,
    excludedCoordinateCount: count,
    isolatedIncidentCount: count,
    hotspots: z
      .array(
        z
          .object({
            cellId: text,
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            incidentCount: count,
            rank: count.refine((value) => value > 0),
            concentration: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            byType: groups,
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
const coverage = z
  .object({
    totalRoutes: count,
    coveredRoutes: count,
    limitedActivityRoutes: count,
    neglectedRoutes: count,
    coveragePercentage: z.number().min(0).max(100),
    patrolSessionCount: count,
    completedPatrolCount: count,
    excludedSessionCount: count,
    missingGeometryRouteCount: count,
    routes: z
      .array(
        z
          .object({
            routeId: text,
            routeName: text,
            status: z.enum(PATROL_COVERAGE_STATUSES),
            sessionCount: count,
            completedSessionCount: count,
            waypointCount: count,
            lastPatrolDate: timestamp.nullable(),
            geometry: z
              .object({
                type: z.literal('LineString'),
                coordinates: z
                  .array(
                    z.tuple([
                      z.number().min(-180).max(180),
                      z.number().min(-90).max(90),
                    ]),
                  )
                  .max(10000),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
const trends = z
  .object({
    scope: z.literal('SELECTED_PARK'),
    locations: z
      .object({
        gridSizeDegrees: z.number().positive(),
        validAlertCount: count,
        excludedCoordinateCount: count,
        locations: z
          .array(
            z
              .object({
                cellId: text,
                rank: count.refine((value) => value > 0),
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180),
                alertCount: count.refine((value) => value > 0),
                bySeverity: groups,
                byType: groups,
              })
              .strict(),
          )
          .max(10000),
      })
      .strict(),
    scopeNotice: z.literal(HWC_SCOPE_NOTICE),
    totalAlerts: count,
    alertsOverTime: series,
    bySeverity: groups,
    byStatus: groups,
    bySource: groups,
    byType: groups,
    totalResponses: count,
    responsesByAction: groups,
    responsesOverTime: series,
  })
  .strict();
const analyticsResult = z
  .object({
    generatedAt: timestamp,
    filters: criteria,
    park,
    status: z.literal('DATA'),
    matchedRecords: z
      .object({
        incidents: count,
        patrols: count,
        conflicts: count.optional(),
        responses: count.optional(),
      })
      .strict(),
    categoryAvailability: z
      .array(
        z
          .object({
            category: z.enum(ANALYSIS_CATEGORIES),
            status: z.enum([
              'AVAILABLE',
              'NOT_IMPLEMENTED',
              'UNAVAILABLE_PARK_ASSOCIATION',
            ]),
          })
          .strict(),
      )
      .max(4),
    limitations: z.array(text).max(100),
    summary: z
      .object({
        patrols: z
          .object({ total: count, completed: count, active: count })
          .strict(),
        incidents: z.object({ total: count }).strict(),
        conflicts: z
          .object({ total: count, open: count, resolved: count })
          .strict(),
        responses: z.object({ total: count }).strict(),
      })
      .strict(),
    incidents: z.object({ byType: groups, byStatus: groups }).strict(),
    patrols: z.object({ byStatus: groups, byRanger: groups }).strict(),
    conflicts: z
      .object({
        bySeverity: groups,
        byStatus: groups,
        bySource: groups,
        byType: groups,
      })
      .strict(),
    responses: z.object({ byAction: groups }).strict(),
    incidentStatistics: statistics.optional(),
    incidentHotspots: hotspots.optional(),
    patrolCoverage: coverage.optional(),
    conflictTrends: trends.optional(),
  })
  .strict();

function sameValue(left: object, right: object): boolean {
  const entries = (value: object) =>
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

export const reportSnapshotSchema = z
  .object({
    generatedAt: timestamp,
    park,
    appliedCriteria: criteria,
    selectedCategories: z.array(z.enum(ANALYSIS_CATEGORIES)).min(1).max(4),
    analyticsResult,
  })
  .strict()
  .superRefine((report, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, message });
    const data = report.analyticsResult;
    const selected = report.selectedCategories;
    if (
      !sameValue(report.appliedCriteria, data.filters) ||
      JSON.stringify(selected) !==
        JSON.stringify(report.appliedCriteria.categories) ||
      new Set(selected).size !== selected.length
    )
      invalid('Report criteria must match the reviewed analysis.');
    if (
      report.park.id !== report.appliedCriteria.parkId ||
      !sameValue(report.park, data.park)
    )
      invalid('Report park must match the reviewed analysis.');
    const sections = {
      INCIDENT_STATISTICS: data.incidentStatistics,
      INCIDENT_HOTSPOTS: data.incidentHotspots,
      PATROL_COVERAGE: data.patrolCoverage,
      HWC_TRENDS: data.conflictTrends,
    };
    for (const category of ANALYSIS_CATEGORIES) {
      if (selected.includes(category) !== (sections[category] !== undefined))
        invalid('Report sections must correspond to the selected categories.');
    }
    if (
      data.categoryAvailability.length !== selected.length ||
      selected.some(
        (category) =>
          !data.categoryAvailability.some(
            (item) => item.category === category && item.status === 'AVAILABLE',
          ),
      )
    )
      invalid('Report requires successful selected-category analysis.');
    // Only selected sources can establish eligibility. Unrelated legacy totals
    // cannot turn an empty selected category into a reportable analysis.
    if (!hasReportableFindings(data))
      invalid('Report requires meaningful matching conservation data.');
    if (
      data.incidentStatistics &&
      data.incidentStatistics.total !== data.matchedRecords.incidents
    )
      invalid('Incident totals must match the reviewed records.');
    if (
      data.patrolCoverage &&
      (data.patrolCoverage.routes.length !== data.patrolCoverage.totalRoutes ||
        data.patrolCoverage.coveredRoutes +
          data.patrolCoverage.limitedActivityRoutes +
          data.patrolCoverage.neglectedRoutes !==
          data.patrolCoverage.totalRoutes)
    )
      invalid('Patrol route totals are inconsistent.');
    if (
      data.conflictTrends &&
      (data.conflictTrends.totalAlerts !==
        (data.matchedRecords.conflicts ?? 0) ||
        data.conflictTrends.totalResponses !==
          (data.matchedRecords.responses ?? 0))
    )
      invalid('Conflict totals must match the reviewed records.');
    // Validate relationships inside server-issued/persisted findings. Structural
    // consistency alone cannot establish authority; HTTP clients never submit this.
    const sum = (rows: Array<{ count: number }>) =>
      rows.reduce((total, row) => total + row.count, 0);
    const statistics = data.incidentStatistics;
    if (
      statistics &&
      [
        sum(statistics.byType),
        sum(statistics.byStatus),
        sum(statistics.overTime.points),
      ].some((total) => total !== statistics.total)
    )
      invalid('Incident breakdowns are inconsistent.');
    const hotspotAnalysis = data.incidentHotspots;
    if (
      hotspotAnalysis &&
      (hotspotAnalysis.validIncidentCount +
        hotspotAnalysis.excludedCoordinateCount !==
        data.matchedRecords.incidents ||
        hotspotAnalysis.hotspots.reduce(
          (total, hotspot) => total + hotspot.incidentCount,
          0,
        ) +
          hotspotAnalysis.isolatedIncidentCount !==
          hotspotAnalysis.validIncidentCount ||
        hotspotAnalysis.hotspots.some(
          (hotspot) =>
            hotspot.incidentCount < hotspotAnalysis.minimumIncidents ||
            sum(hotspot.byType) !== hotspot.incidentCount,
        ))
    )
      invalid('Hotspot findings are inconsistent.');
    const routeCoverage = data.patrolCoverage;
    if (
      routeCoverage &&
      (routeCoverage.patrolSessionCount !== data.matchedRecords.patrols ||
        routeCoverage.routes.reduce(
          (total, route) => total + route.sessionCount,
          0,
        ) !== routeCoverage.patrolSessionCount ||
        routeCoverage.routes.reduce(
          (total, route) => total + route.completedSessionCount,
          0,
        ) !== routeCoverage.completedPatrolCount ||
        routeCoverage.routes.some(
          (route) => route.completedSessionCount > route.sessionCount,
        ) ||
        routeCoverage.routes.filter((route) => route.status === 'COVERED')
          .length !== routeCoverage.coveredRoutes ||
        routeCoverage.routes.filter(
          (route) => route.status === 'LIMITED_ACTIVITY',
        ).length !== routeCoverage.limitedActivityRoutes ||
        routeCoverage.routes.filter((route) => route.status === 'NEGLECTED')
          .length !== routeCoverage.neglectedRoutes)
    )
      invalid('Patrol findings are inconsistent.');
    const conflictTrends = data.conflictTrends;
    if (
      conflictTrends &&
      ([
        sum(conflictTrends.bySeverity),
        sum(conflictTrends.byStatus),
        sum(conflictTrends.bySource),
        sum(conflictTrends.byType),
        sum(conflictTrends.alertsOverTime.points),
      ].some((total) => total !== conflictTrends.totalAlerts) ||
        sum(conflictTrends.responsesByAction) !==
          conflictTrends.totalResponses ||
        sum(conflictTrends.responsesOverTime.points) !==
          conflictTrends.totalResponses)
    )
      invalid('Conflict breakdowns are inconsistent.');
    if (conflictTrends) {
      const spatial = conflictTrends.locations;
      if (
        spatial.validAlertCount + spatial.excludedCoordinateCount !==
          conflictTrends.totalAlerts ||
        sum(spatial.locations.map((cell) => ({ count: cell.alertCount }))) !==
          spatial.validAlertCount ||
        spatial.locations.some(
          (cell) =>
            sum(cell.byType) !== cell.alertCount ||
            sum(cell.bySeverity) !== cell.alertCount,
        )
      )
        invalid('Conflict location counts are inconsistent.');
    }
  });

export function validateReportSnapshot(
  value: unknown,
): ConservationReportSnapshot {
  reportSnapshotSchema.parse(value);
  // Parsing validates normalized criteria; return the original JSON representation
  // so generation/export never rewrite the reviewed snapshot or its empty controls.
  return value as ConservationReportSnapshot;
}
