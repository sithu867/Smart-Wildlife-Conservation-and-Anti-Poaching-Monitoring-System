import type { Model, Types } from 'mongoose';
import {
  ParkModel,
  PatrolRouteModel,
  PatrolSessionModel,
  type IPark,
  type IPatrolRoute,
  type IPatrolSession,
} from '../patrols/models.js';
import {
  ConservationIncidentModel,
  type IConservationIncident,
} from '../incidents/models.js';
import type {
  AnalysisCriteria,
  AnalyticsResult,
  ParkOption,
} from './contract.js';
import {
  WildlifeConflictAlertModel,
  type IWildlifeConflictAlert,
} from '../conflict-alerts/models.js';
import {
  calculateIncidentStatistics,
  calculateConflictTrends,
  groupBy,
} from './calculations.js';
import { calculateIncidentHotspots } from './hotspots.js';
import { calculatePatrolCoverage } from './patrolCoverage.js';
import { HWC_SCOPE_NOTICE } from './contract.js';
import { analysisCriteriaSchema, analysisDateRange } from './validation.js';

// Existing model exports include Mongoose's untyped model cache. Narrow them
// locally so UC-D queries are typed without modifying other use cases.
const parks = ParkModel as Model<IPark>;
const routes = PatrolRouteModel as Model<IPatrolRoute>;
const sessions = PatrolSessionModel as Model<IPatrolSession>;
const incidents = ConservationIncidentModel as Model<IConservationIncident>;
const conflicts = WildlifeConflictAlertModel as Model<IWildlifeConflictAlert>;

export class AnalyticsCriteriaError extends Error {}

function parkOption(
  park: Pick<IPark, 'name' | 'code'> & { _id: Types.ObjectId },
): ParkOption {
  return { id: String(park._id), name: park.name, code: park.code };
}

export async function listAnalyticsParks(): Promise<ParkOption[]> {
  // Read only: never call the patrol service's seeding or demo fallback.
  const records = await parks
    .find({})
    .select('name code')
    .sort({ name: 1 })
    .lean();
  return records.map(parkOption);
}

export async function getCriteriaAnalytics(
  input: AnalysisCriteria,
): Promise<AnalyticsResult> {
  // Validate here too, so non-HTTP callers cannot bypass the contract.
  const criteria = analysisCriteriaSchema.parse(input);
  const park = await parks.findById(criteria.parkId).select('name code').lean();
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

  const parkRoutes =
    wantsIncidents || wantsPatrols
      ? await routes
          .find({ park: park._id })
          .select(wantsPatrols ? '_id name geometry' : '_id')
          .lean()
      : [];
  const routeIds = parkRoutes.map((route) => route._id);

  // UC-A copies assignment.patrolRoute into session.patrolRoute when starting
  // a session. This existing direct link is sufficient: Park -> Route -> Session.
  // Do not guess park membership from a ranger, coordinates, or route proximity.
  const scopedSessions = wantsIncidents
    ? await sessions
        .find({ patrolRoute: { $in: routeIds } })
        .select('_id')
        .lean()
    : [];

  // There is no trustworthy park link for UC-C records. Apply only reliable
  // alert filters, and expose ALL_PARKS_UNASSIGNED explicitly in the contract.
  const conflictFilters = {
    ...(criteria.rangerId ? { acknowledgedBy: criteria.rangerId } : {}),
    ...(criteria.severity ? { severity: criteria.severity } : {}),
    ...(criteria.conflictStatus ? { status: criteria.conflictStatus } : {}),
    ...(criteria.conflictSource ? { source: criteria.conflictSource } : {}),
    ...(criteria.conflictType ? { alertType: criteria.conflictType } : {}),
  };
  const [incidentRows, patrolRows, alertRows, responseAlerts] =
    await Promise.all([
      wantsIncidents
        ? incidents
            .find({
              patrolSession: {
                $in: scopedSessions.map((session) => session._id),
              },
              // Session dates must not exclude an incident reported within this range.
              reportedAt: { $gte: start, $lte: end },
              ...(criteria.rangerId ? { reportedBy: criteria.rangerId } : {}),
              ...(criteria.incidentType
                ? { incidentType: criteria.incidentType }
                : {}),
              ...(criteria.incidentStatus
                ? { status: criteria.incidentStatus }
                : {}),
            })
            .select('incidentType status reportedAt location')
            .lean()
        : [],
      wantsPatrols
        ? sessions
            .find({
              patrolRoute: { $in: routeIds },
              // Include explicit activity events from long-running sessions,
              // including a completion or waypoint after an earlier start.
              $or: [
                { startTime: { $gte: start, $lte: end } },
                { endTime: { $gte: start, $lte: end } },
                { 'waypoints.timestamp': { $gte: start, $lte: end } },
              ],
              ...(criteria.rangerId ? { rangerId: criteria.rangerId } : {}),
            })
            .lean()
        : [],
      wantsConflicts
        ? conflicts
            .find({ ...conflictFilters, createdAt: { $gte: start, $lte: end } })
            .select('createdAt severity status source alertType')
            .lean()
        : [],
      // Response activity is dated independently of alert creation. Otherwise an
      // in-period response to an older alert would disappear from the trend.
      // The same parent-alert filters (including acknowledgedBy) apply here.
      wantsConflicts
        ? conflicts
            .find({
              ...conflictFilters,
              'responses.respondedAt': { $gte: start, $lte: end },
            })
            .select('responses')
            .lean()
        : [],
    ]);

  const responses = responseAlerts
    .flatMap((alert) => alert.responses ?? [])
    .filter((response) => {
      const respondedAt = new Date(response.respondedAt);
      return (
        Number.isFinite(respondedAt.getTime()) &&
        respondedAt >= start &&
        respondedAt <= end
      );
    });
  const limitations: string[] = [];
  if (wantsIncidents)
    limitations.push(
      'Incidents without a valid patrol-session-to-park link are excluded from park-scoped analysis.',
    );
  if (wantsConflicts)
    limitations.push(
      HWC_SCOPE_NOTICE,
      'Conflict Ranger ID filters acknowledgedBy; response activity uses respondedAt and the same parent-alert filters, including alerts created before this period.',
    );
  if (wantsPatrols)
    limitations.push(
      'Coverage is completed routes / all selected-park routes, not geographic land area. Ranger ID filters activity, not the route denominator.',
      'Activity uses starts, completions and valid waypoints in the inclusive UTC period. Completed sessions lacking an end time use their start time. Assignments alone do not count as patrol activity.',
      'Sessions without a valid direct route-to-park link are excluded; park membership is never inferred from coordinates or ranger identity.',
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
  const patrolCoverage = wantsPatrols
    ? calculatePatrolCoverage(parkRoutes, patrolRows, start, end)
    : undefined;
  if (patrolCoverage?.excludedSessionCount)
    limitations.push(
      `${patrolCoverage.excludedSessionCount} retrieved sessions with missing or unknown route links were excluded.`,
    );
  return {
    generatedAt: new Date().toISOString(),
    filters: criteria,
    park: parkOption(park),
    status:
      incidentRows.length ||
      // Routes with no activity are meaningful neglected-route findings.
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
      status: category === 'HWC_TRENDS' ? 'AVAILABLE_UNSCOPED' : 'AVAILABLE',
    })),
    limitations,
    summary: {
      patrols: {
        total: patrolRows.length,
        completed: patrolRows.filter((row) => row.status === 'COMPLETED')
          .length,
        active: patrolRows.filter((row) => row.status === 'ACTIVE').length,
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
      byStatus: groupBy(patrolRows, 'status'),
      byRanger: groupBy(patrolRows, 'rangerName'),
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
