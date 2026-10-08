import { prisma } from '../src/config/prisma.js';
import { getCriteriaAnalytics } from '../src/modules/analytics/criteriaService.js';
import { ANALYSIS_CATEGORIES } from '../src/modules/analytics/contract.js';

// Read-only inventory: to_jsonb reads optional parkId even before the additive
// migration is applied. No inferred park assignment is written to the database.
async function main() {
  try {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
    SELECT table_name::text, column_name::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('ConservationIncident', 'WildlifeConflictAlert') AND column_name = 'parkId'`;
    const parks = await prisma.park.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { routes: true } },
      },
      orderBy: { name: 'asc' },
    });
    const start = process.argv
      .find((arg) => arg.startsWith('--start='))
      ?.slice(8);
    const end = process.argv.find((arg) => arg.startsWith('--end='))?.slice(6);
    if (start && end) {
      for (const park of parks) {
        const data = await getCriteriaAnalytics({
          parkId: park.id,
          start,
          end,
          categories: [...ANALYSIS_CATEGORIES],
        });
        console.log(
          JSON.stringify(
            {
              park: data.park,
              filters: data.filters,
              status: data.status,
              summary: data.summary,
              incidentStatistics: data.incidentStatistics,
              hotspots: data.incidentHotspots,
              patrolCoverage: data.patrolCoverage,
              conflictTrends: data.conflictTrends,
              limitations: data.limitations,
            },
            null,
            2,
          ),
        );
      }
      return;
    }
    const patrols = await prisma.$queryRaw`
    SELECT route."parkId", session."startTime"::date::text AS "startDateUTC",
      session."endTime"::date::text AS "endDateUTC", session.status,
      count(*)::int AS sessions, array_agg(session.id ORDER BY session.id) AS "sessionIds"
    FROM "PatrolSession" session JOIN "PatrolRoute" route ON route.id = session."patrolRouteId"
    GROUP BY route."parkId", session."startTime"::date, session."endTime"::date, session.status
    ORDER BY route."parkId", session."startTime"::date`;
    const incidents = await prisma.$queryRaw`
    SELECT CASE WHEN incident."patrolSessionId" IS NOT NULL THEN route."parkId"
      ELSE to_jsonb(incident)->>'parkId' END AS "effectiveParkId",
      incident."reportedAt"::date::text AS "dateUTC", incident."incidentType", incident.status,
      count(*)::int AS incidents, array_agg(incident.id ORDER BY incident.id) AS "incidentIds"
    FROM "ConservationIncident" incident
    LEFT JOIN "PatrolSession" session ON session.id = incident."patrolSessionId"
    LEFT JOIN "PatrolRoute" route ON route.id = session."patrolRouteId"
    GROUP BY "effectiveParkId", incident."reportedAt"::date, incident."incidentType", incident.status
    ORDER BY "effectiveParkId", incident."reportedAt"::date`;
    const alerts = await prisma.$queryRaw`
    SELECT to_jsonb(alert)->>'parkId' AS "parkId", alert."createdAt"::date::text AS "dateUTC",
      alert.source, alert."alertType", alert.severity, alert.status,
      count(*)::int AS alerts, array_agg(alert.id ORDER BY alert.id) AS "alertIds"
    FROM "WildlifeConflictAlert" alert
    GROUP BY to_jsonb(alert)->>'parkId', alert."createdAt"::date, alert.source, alert."alertType", alert.severity, alert.status
    ORDER BY "parkId", alert."createdAt"::date`;
    const responses = await prisma.$queryRaw`
    SELECT to_jsonb(alert)->>'parkId' AS "parentParkId", response."respondedAt"::date::text AS "dateUTC",
      response.action, count(*)::int AS responses
    FROM "ConflictResponse" response JOIN "WildlifeConflictAlert" alert ON alert.id = response."alertId"
    GROUP BY to_jsonb(alert)->>'parkId', response."respondedAt"::date, response.action
    ORDER BY "parentParkId", response."respondedAt"::date`;
    console.log(
      JSON.stringify(
        { parkColumns: columns, parks, patrols, incidents, alerts, responses },
        null,
        2,
      ),
    );
  } catch (error) {
    // Do not print adapter errors, which can contain connection details.
    console.error(
      'Unable to read conservation inventory. Check database connectivity and configuration. No data was changed.',
    );
    if (error instanceof Error) {
      const code =
        'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined;
      const meta =
        'meta' in error && error.meta && typeof error.meta === 'object'
          ? (error.meta as Record<string, unknown>)
          : {};
      const message =
        error.message + (typeof meta.message === 'string' ? meta.message : '');
      const reason = /enum|PatrolStatus/i.test(message)
        ? 'stored lifecycle value outside the current Prisma enum'
        : /does not exist/i.test(message)
          ? 'missing database relation'
          : /certificate/i.test(message)
            ? 'TLS certificate error'
            : /fetch|connect|ENOTFOUND|ECONNREFUSED/i.test(message)
              ? 'connection failure'
              : 'database query failure';
      console.error(
        JSON.stringify({
          name: error.name,
          code,
          databaseCode: meta.code,
          reason,
        }),
      );
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
