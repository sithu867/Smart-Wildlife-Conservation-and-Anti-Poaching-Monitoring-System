import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from './contract.js';
import {
  calculateIncidentStatistics,
  calculateConflictTrends,
  groupBy,
} from './calculations.js';
import { calculateIncidentHotspots } from './hotspots.js';
import {
  calculatePatrolCoverage,
  patrolSessionActivity,
} from './patrolCoverage.js';
import { HWC_SCOPE_NOTICE } from './contract.js';
import { analysisCriteriaSchema, analysisDateRange } from './validation.js';
import { PatrolStatus } from '../../types/enums.js';

export class AnalyticsCriteriaError extends Error {}

export async function listAnalyticsParks(): Promise<ParkOption[]> {
  return prisma.park.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
}

export async function getCriteriaAnalytics(
  input: AnalysisCriteria,
): Promise<AnalyticsResult> {
  const criteria = analysisCriteriaSchema.parse(input);
  const park = await prisma.park.findUnique({
    where: { id: criteria.parkId },
    select: { id: true, name: true, code: true },
  });
  if (!park)
    throw new AnalyticsCriteriaError(
      'The selected Park / Conservation Area does not exist. Please select another park.',
    );
  const selected = new Set(criteria.categories);
  const wantsIncidents =
    selected.has('INCIDENT_STATISTICS') || selected.has('INCIDENT_HOTSPOTS');
  const wantsPatrols = selected.has('PATROL_COVERAGE');
  const wantsConflicts = selected.has('HWC_TRENDS');
  const { start, end } = analysisDateRange(criteria);
const period = { gte: start, lte: end };
  const routes =
    wantsIncidents || wantsPatrols
      ? await prisma.patrolRoute.findMany({
          where: { parkId: park.id },
          select: { id: true, name: true, geometry: true },
        })
      : [];
  const routeIds = routes.map((route) => route.id);

  // Incident park membership comes from the real session/route relationship.
  // Do not date-filter these links: an incident reported in-period can belong
  // to a patrol that started earlier. Explicit standalone park links are also supported.
  const scopedSessions = wantsIncidents
    ? await prisma.patrolSession.findMany({
        where: { patrolRouteId: { in: routeIds } },
        select: { id: true },
      })
    : [];
  const incidentRows = wantsIncidents
    ? await prisma.conservationIncident.findMany({
        where: {
          deletedAt: null,
          OR: [
            {
              patrolSessionId: {
                in: scopedSessions.map((session) => session.id),
              },
            },
            { patrolSessionId: null, parkId: park.id },
          ],
          reportedAt: period,
          reportedBy: criteria.rangerId,
          incidentType: criteria.incidentType,
          status: criteria.incidentStatus,
        },
        select: {
          incidentType: true,
          status: true,
          reportedAt: true,
          location: true,
        },
      })
    : [];

  // Fetch a session once even when several events qualify. A start-only filter
  // would lose completions and waypoints on patrols begun before the period.
  const sessionRows = wantsPatrols
    ? await prisma.patrolSession.findMany({
        where: {
          patrolRouteId: { in: routeIds },
          rangerId: criteria.rangerId,
          status: {
            in: [
              PatrolStatus.ASSIGNED,
              PatrolStatus.ACTIVE,
              PatrolStatus.COMPLETED,
            ],
          },
          OR: [
            { startTime: period },
            { endTime: period },
            { waypoints: { some: { timestamp: period } } },
          ],
        },
        include: { waypoints: { where: { timestamp: period } } },
      })
    : [];

  const patrolCoverage = wantsPatrols
    ? calculatePatrolCoverage(routes, sessionRows, start, end)
    : undefined;
  const seenSessionIds = new Set<string>();
  const sessions = sessionRows
    .filter((session) => {
      if (seenSessionIds.has(session.id)) return false;
      seenSessionIds.add(session.id);
      return true;
    })
    .filter(
      (session) =>
        routeIds.includes(session.patrolRouteId) &&
        patrolSessionActivity(session, start, end).times.length > 0,
    );

  const conflictFilters = {
    parkId: park.id,
    acknowledgedBy: criteria.rangerId,
    severity: criteria.severity,
    status: criteria.conflictStatus,
    source: criteria.conflictSource,
    alertType: criteria.conflictType,
  } satisfies Prisma.WildlifeConflictAlertWhereInput;
  const alertRows = wantsConflicts
    ? await prisma.wildlifeConflictAlert.findMany({
        where: { ...conflictFilters, createdAt: period },
        select: {
          createdAt: true,
          location: true,
          severity: true,
          status: true,
          source: true,
          alertType: true,
        },
      })
    : [];
  const responseAlerts = wantsConflicts
    ? await prisma.wildlifeConflictAlert.findMany({
        where: {
          ...conflictFilters,
          responses: { some: { respondedAt: period } },
        },
        select: {
          responses: {
            where: { respondedAt: period },
            select: { action: true, respondedAt: true },
          },
        },
      })
    : [];
  const responses = responseAlerts
    .flatMap((alert) => alert.responses)
    .filter(
      (response) => response.respondedAt >= start && response.respondedAt <= end,
    );
  const limitations: string[] = [];
  if (wantsIncidents)
    limitations.push(
      'Incidents use their patrol route park, or an explicit park association for standalone reports. Legacy incidents with neither association are excluded; coordinates are never used to guess a park.',
    );
  if (wantsConflicts)
    limitations.push(
      HWC_SCOPE_NOTICE,
      'Conflict Ranger ID filters acknowledgedBy; response activity uses respondedAt and the same parent-alert filters.',
    );
  if (wantsPatrols)
    limitations.push(
      'Coverage is completed routes / all selected-park routes, not geographic land area.',
      'Activity uses starts, completions and valid waypoints in the inclusive UTC period.',
      'Patrol activity includes the supported Assigned, Active and Completed lifecycle states. Historical unsupported states (such as Cancelled) are excluded.',
    );
  const incidentStatistics = selected.has('INCIDENT_STATISTICS')
    ? calculateIncidentStatistics(incidentRows, start, end)
    : undefined;
  const incidentHotspots = selected.has('INCIDENT_HOTSPOTS')
    ? calculateIncidentHotspots(incidentRows)
    : undefined;
  const conflictTrends = wantsConflicts
    ? calculateConflictTrends(alertRows, responses, start, end)
    : undefined;
  if (patrolCoverage?.excludedSessionCount)
    limitations.push(
      `${patrolCoverage.excludedSessionCount} retrieved sessions with missing or unknown route links were excluded.`,
    );
  return {
    generatedAt: new Date().toISOString(),
    filters: criteria,
    park,
    status:
      incidentRows.length ||
      (patrolCoverage?.totalRoutes ?? 0) ||
      alertRows.length ||
      responses.length
        ? 'DATA'
        : 'NO_MATCHING_DATA',
    matchedRecords: {
      incidents: incidentRows.length,
      patrols: patrolCoverage?.patrolSessionCount ?? 0,
      ...(wantsConflicts
        ? { conflicts: alertRows.length, responses: responses.length }
        : {}),
    },
    categoryAvailability: criteria.categories.map((category) => ({
      category,
      status: 'AVAILABLE',
    })),
    limitations,
    summary: {
      patrols: {
        total: sessions.length,
        completed: patrolCoverage?.completedPatrolCount ?? 0,
        active: sessions.filter((row) => row.status === 'ACTIVE').length,
      },
      incidents: { total: incidentRows.length },
      conflicts: {
        total: alertRows.length,
        open: alertRows.filter(
          (row) => row.status !== 'RESOLVED' && row.status !== 'CANCELLED',
        ).length,
        resolved: alertRows.filter((row) => row.status === 'RESOLVED').length,
      },
      responses: { total: responses.length },
    },
    incidents: {
      byType: incidentStatistics?.byType ?? [],
      byStatus: incidentStatistics?.byStatus ?? [],
    },
    patrols: {
      byStatus: groupBy(sessions, 'status'),
      byRanger: groupBy(sessions, 'rangerName'),
    },
    conflicts: {
      bySeverity: conflictTrends?.bySeverity ?? [],
      byStatus: conflictTrends?.byStatus ?? [],
      bySource: conflictTrends?.bySource ?? [],
      byType: conflictTrends?.byType ?? [],
    },
    responses: { byAction: conflictTrends?.responsesByAction ?? [] },
    ...(incidentStatistics ? { incidentStatistics } : {}),
    ...(incidentHotspots ? { incidentHotspots } : {}),
    ...(conflictTrends ? { conflictTrends } : {}),
    ...(patrolCoverage ? { patrolCoverage } : {}),
  };
}
