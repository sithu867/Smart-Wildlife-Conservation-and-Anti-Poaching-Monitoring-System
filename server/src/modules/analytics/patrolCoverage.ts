import { PatrolStatus } from '../../types/enums.js';
import type {
  PatrolCoverageAnalysis,
  PatrolRouteCoverage,
} from './contract.js';

interface RouteRecord {
  id: string;
  name?: string;
  geometry?: unknown;
}
export interface CoverageSessionRecord {
  id?: string;
  patrolRouteId?: string;
  startTime?: Date | string;
  endTime?: Date | string | null;
  status?: string;
  waypoints?: unknown;
}

function eventTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}
function validCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    Math.abs(value[1]) <= 90
  );
}
function waypointTimes(waypoints: unknown): Array<number | null> {
  if (!Array.isArray(waypoints)) return [];
  const seen = new Set<string>();
  return waypoints.map((point: unknown) => {
    if (!point || typeof point !== 'object') return null;
    const record = point as Record<string, unknown>;
    if (!validCoordinate([record.longitude, record.latitude])) return null;
    // Replayed waypoint rows must not inflate activity. Prefer their persisted
    // ID; old projections without IDs use the exact timestamp/coordinate tuple.
    const key =
      typeof record.id === 'string'
        ? record.id
        : `${String(record.timestamp)}:${String(record.latitude)}:${String(record.longitude)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return record.timestamp instanceof Date ||
      typeof record.timestamp === 'string'
      ? eventTime(record.timestamp)
      : null;
  });
}
function routeGeometry(route: RouteRecord): PatrolRouteCoverage['geometry'] {
  // Prisma Json is not guaranteed to contain a GeoJSON object.
  const geometry =
    route.geometry && typeof route.geometry === 'object'
      ? (route.geometry as Record<string, unknown>)
      : null;
  // Reject a broken LineString as a whole rather than connecting disjoint valid
  // fragments and inventing an unrecorded path. Its route still appears in the list.
  return geometry?.type === 'LineString' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(validCoordinate)
    ? { type: 'LineString', coordinates: geometry.coordinates }
    : null;
}

// Share activity qualification between route coverage and report summary totals.
// The query finds candidate events; this also checks coordinates and lifecycle.
export function patrolSessionActivity(
  session: CoverageSessionRecord,
  start: Date,
  end: Date,
) {
  const inPeriod = (time: number | null): time is number =>
    time !== null && time >= start.getTime() && time <= end.getTime();
  const started = eventTime(session.startTime);
  const ended = eventTime(session.endTime);
  // Historical malformed waypoint arrays/entries are ignored locally; they
  // must not turn an otherwise valid park analysis into a system error.
  const recordedTimes = waypointTimes(session.waypoints)
    .filter(inPeriod)
    .filter(
      (time) =>
        (started === null || time >= started) &&
        (session.status !== PatrolStatus.COMPLETED ||
          ended === null ||
          time <= ended),
    );
  // A completed patrol is dated by completion. Older records lacking an
  // endTime use their recorded start; a later completion never covers an earlier period.
  const completionTime = session.endTime == null ? started : ended;
  // An explicitly invalid endTime or reversed lifecycle cannot establish an
  // in-period completion; any trustworthy start/waypoints can still be activity.
  const completed =
    session.status === PatrolStatus.COMPLETED &&
    (started === null || ended === null || ended >= started) &&
    inPeriod(completionTime);
  const startedActivity =
    (session.status === PatrolStatus.ACTIVE ||
      session.status === PatrolStatus.COMPLETED) &&
    inPeriod(started);
  // ASSIGNED alone is planning, not field activity. Valid in-period waypoints
  // can still evidence activity on an imperfect historical session record.
  const activityTimes = [...recordedTimes];
  if (startedActivity && started !== null) activityTimes.push(started);
  if (completed && completionTime !== null) activityTimes.push(completionTime);
  return {
    completed,
    waypointCount: recordedTimes.length,
    times: activityTimes,
  };
}

export function calculatePatrolCoverage(
  parkRoutes: RouteRecord[],
  sessions: CoverageSessionRecord[],
  start: Date,
  end: Date,
): PatrolCoverageAnalysis {
  const routes = new Map<string, PatrolRouteCoverage>();
  for (const route of parkRoutes) {
    const routeId = route.id;
    if (!routeId || routes.has(routeId)) continue;
    routes.set(routeId, {
      routeId,
      routeName: route.name || 'Unnamed route',
      status: 'NEGLECTED',
      sessionCount: 0,
      completedSessionCount: 0,
      waypointCount: 0,
      lastPatrolDate: null,
      geometry: routeGeometry(route),
    });
  }
  let excludedSessionCount = 0;
  const seenSessions = new Set<string>();
  for (const session of sessions) {
    // Use Prisma's stored foreign key, not an optional populated relation object.
    // The park route set prevents another park's session from establishing coverage.
    if (session.id && seenSessions.has(session.id)) continue;
    if (session.id) seenSessions.add(session.id);
    const route = routes.get(session.patrolRouteId ?? '');
    if (!route) {
      excludedSessionCount++;
      continue;
    }
    const activity = patrolSessionActivity(session, start, end);
    if (!activity.times.length) continue;
    route.sessionCount++;
    route.completedSessionCount += Number(activity.completed);
    route.waypointCount += activity.waypointCount;
    const activityTimes = activity.times;
    const last = new Date(Math.max(...activityTimes)).toISOString();
    if (!route.lastPatrolDate || last > route.lastPatrolDate)
      route.lastPatrolDate = last;
    // An incomplete patrol is limited activity, never equivalent to no patrol.
    route.status = route.completedSessionCount ? 'COVERED' : 'LIMITED_ACTIVITY';
  }
  const resultRoutes = [...routes.values()].sort(
    (a, b) =>
      a.routeName.localeCompare(b.routeName) ||
      a.routeId.localeCompare(b.routeId),
  );
  const coveredRoutes = resultRoutes.filter(
    (route) => route.status === 'COVERED',
  ).length;
  const limitedActivityRoutes = resultRoutes.filter(
    (route) => route.status === 'LIMITED_ACTIVITY',
  ).length;
  return {
    totalRoutes: routes.size,
    coveredRoutes,
    limitedActivityRoutes,
    neglectedRoutes: routes.size - coveredRoutes - limitedActivityRoutes,
    // This measures completed route coverage, not land area: Park has no boundary
    // polygons and waypoint density cannot establish geographic area coverage.
    coveragePercentage: routes.size
      ? Math.round((coveredRoutes / routes.size) * 1000) / 10
      : 0,
    patrolSessionCount: resultRoutes.reduce(
      (total, route) => total + route.sessionCount,
      0,
    ),
    completedPatrolCount: resultRoutes.reduce(
      (total, route) => total + route.completedSessionCount,
      0,
    ),
    excludedSessionCount,
    missingGeometryRouteCount: resultRoutes.filter((route) => !route.geometry)
      .length,
    routes: resultRoutes,
  };
}
