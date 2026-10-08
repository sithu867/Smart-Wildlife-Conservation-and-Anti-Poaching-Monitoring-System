import {
  PATROL_COVERAGE_LABELS,
  PATROL_COVERAGE_STATUSES,
  type PatrolCoverageAnalysis,
} from '../../../../server/src/modules/analytics/contract';
import { PatrolCoverageMap, routePositions } from './PatrolCoverageMap';

import { formatAnalysisTimestamp } from './formatting';

export function PatrolCoverageResults({
  analysis,
}: {
  analysis: PatrolCoverageAnalysis;
}) {
  return (
    <section
      className="card analytics-category analytics-coverage"
      aria-label="Patrol Coverage results"
    >
      <p className="eyebrow">Route activity</p>
      <h2>Patrol Coverage</h2>
      <p>
        Completed routes / all routes in the selected park. This measures route
        coverage, not exact land area.
      </p>
      <dl className="analytics-metrics">
        {[
          ['Coverage', `${analysis.coveragePercentage}%`],
          ['Total routes', analysis.totalRoutes],
          ['Covered routes', analysis.coveredRoutes],
          ['Limited-activity routes', analysis.limitedActivityRoutes],
          ['Neglected routes', analysis.neglectedRoutes],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        {analysis.patrolSessionCount} meaningful patrol sessions ·{' '}
        {analysis.completedPatrolCount} completed patrols
      </p>
      <ul className="analytics-route-legend" aria-label="Route status legend">
        {PATROL_COVERAGE_STATUSES.map((status) => (
          <li
            key={status}
            className={`analytics-route-status analytics-route-status--${status}`}
          >
            {PATROL_COVERAGE_LABELS[status]}
            {status === 'COVERED'
              ? ' · solid'
              : status === 'LIMITED_ACTIVITY'
                ? ' · dashed'
                : ' · dotted'}
          </li>
        ))}
      </ul>
      {!analysis.totalRoutes ? (
        <p>No patrol routes are registered for the selected park.</p>
      ) : (
        <>
          {!analysis.patrolSessionCount && (
            <p>
              No meaningful patrol activity was recorded in the applied period.
              All registered routes are classified as neglected for these
              criteria.
            </p>
          )}
          <PatrolCoverageMap routes={analysis.routes} />
          {!!analysis.missingGeometryRouteCount && (
            <p>
              {analysis.missingGeometryRouteCount} routes lack usable geometry
              and appear only in the route list.
            </p>
          )}
          <ul
            className="analytics-route-list"
            aria-label="Patrol route coverage"
          >
            {analysis.routes.map((route) => (
              <li key={route.routeId}>
                <div className="analytics-route-heading">
                  <h3>{route.routeName}</h3>
                  <span
                    className={`analytics-route-status analytics-route-status--${route.status}`}
                  >
                    {PATROL_COVERAGE_LABELS[route.status]}
                  </span>
                </div>
                <dl className="analytics-route-details">
                  <div>
                    <dt>Patrol sessions</dt>
                    <dd>{route.sessionCount}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{route.completedSessionCount}</dd>
                  </div>
                  <div>
                    <dt>Valid waypoints in period</dt>
                    <dd>{route.waypointCount}</dd>
                  </div>
                  <div>
                    <dt>Last activity (UTC)</dt>
                    <dd>
                      {route.lastPatrolDate
                        ? formatAnalysisTimestamp(route.lastPatrolDate)
                        : 'No activity in period'}
                    </dd>
                  </div>
                </dl>
                {!routePositions(route).length && (
                  <p>Route geometry unavailable</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="analytics-method">
        <summary>How route coverage is classified</summary>
        <p>
          Covered: at least one patrol completed in the period. Limited
          activity: a patrol started or recorded valid waypoints in the period,
          without an in-period completion. Neglected: no meaningful activity in
          the period.
        </p>
        <p>
          Assigned work alone is not activity. Older completed records without
          an end time use their start. Ranger ID filters activity across all
          selected-park routes; waypoints support activity, not land-area
          estimates.
        </p>
      </details>
      {!!analysis.excludedSessionCount && (
        <p>
          {analysis.excludedSessionCount} sessions were excluded because their
          route associations were missing or unknown.
        </p>
      )}
    </section>
  );
}
