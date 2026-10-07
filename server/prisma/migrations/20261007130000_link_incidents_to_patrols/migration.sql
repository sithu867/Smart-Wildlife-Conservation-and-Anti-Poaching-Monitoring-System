-- Data fix: reports made during a patrol but saved without a patrol link
-- (e.g. created from the Incidents screen instead of the patrol screen) are linked
-- to the reporting ranger's patrol whose time window covers the report time.
-- Without the link the report never locks when the patrol is completed.
-- If windows overlap, the most recently started patrol wins.
UPDATE "ConservationIncident" AS incident
SET "patrolSessionId" = match."sessionId"
FROM (
  SELECT DISTINCT ON (i."id") i."id" AS "incidentId", s."id" AS "sessionId"
  FROM "ConservationIncident" AS i
  JOIN "PatrolSession" AS s
    ON s."rangerId" = i."reportedBy"
   AND i."reportedAt" >= s."startTime"
   AND (s."endTime" IS NULL OR i."reportedAt" <= s."endTime")
  WHERE i."patrolSessionId" IS NULL
  ORDER BY i."id", s."startTime" DESC
) AS match
WHERE incident."id" = match."incidentId";

-- Databases that already have park-scoped incidents (parkId column) get the park of the newly linked patrol too
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ConservationIncident' AND column_name = 'parkId'
  ) THEN
    EXECUTE '
      UPDATE "ConservationIncident" AS incident
      SET "parkId" = route."parkId"
      FROM "PatrolSession" AS session
      JOIN "PatrolRoute" AS route ON route."id" = session."patrolRouteId"
      WHERE incident."patrolSessionId" = session."id" AND incident."parkId" IS NULL';
  END IF;
END $$;
