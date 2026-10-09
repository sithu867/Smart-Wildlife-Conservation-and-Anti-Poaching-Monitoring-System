# Unit Testing Summary

SE3070 Assignment 02 – Smart Wildlife Conservation and Anti-Poaching Monitoring System.

Stack under test: React + TypeScript + Vite (Vitest, React Testing Library, fake-indexeddb for Dexie/IndexedDB) on the client; Express + TypeScript + Prisma 7 / Neon PostgreSQL (Jest, Supertest) on the server.

Unit tests never use a database. On the server, Prisma is replaced by an in-memory mock, and `server/tests/setup/unitEnv.js` points `DATABASE_URL` at an unreachable address so an unmocked query fails instead of reaching Neon. On the client, HTTP calls are mocked and IndexedDB is provided by `fake-indexeddb`.

## UC-A – Manage Ranger Patrols

Results recorded on 9 October 2026 from the final code of this phase.

### How to run

| Command | Runs |
|---|---|
| `npm run test:server` | Server type-check and all server unit tests (Jest) |
| `npm run test:client` | All client unit tests (Vitest) |
| `npm run test:coverage` | Both suites with coverage (client, then server) |

### Test files

| File | Layer | Tests | Notes |
|---|---|---|---|
| `server/tests/patrolValidation.test.ts` | Server request validation (zod) | 28 | New |
| `server/tests/patrolService.test.ts` | Server patrol service, Prisma mocked | 56 | New |
| `server/tests/patrolRoutes.test.ts` | Server HTTP controller and routes (Supertest) | 29 | New |
| `server/tests/patrolDistance.test.ts` | Server distance calculations | 6 | 3 existing tests given exact assertions, 3 added |
| `server/tests/patrolPrismaMock.ts` | Reusable Prisma mock for the patrol module | – | Test helper |
| `client/src/features/patrols/api/patrolApi.test.ts` | Patrol API: online, offline (Dexie) and sync | 45 | New |
| `client/src/features/patrols/hooks/usePatrol.test.ts` | `usePatrol` hook, GPS tracking | 35 | New |
| `client/src/features/patrols/pages/PatrolPages.test.tsx` | Assigned, Route, Active and Completion pages | 29 | New |
| `client/src/features/patrols/components/PatrolComponents.test.tsx` | GPS status, sync badge, card, waypoint form, map | 25 | New |
| `client/src/shared/geolocation/geolocation.test.ts` | Shared geolocation service used by UC-A tracking | 6 | New |
| `client/src/features/patrols/Patrols.test.tsx` | Existing UC-A component tests | 10 | Existing; 1 test that only asserted a hand-built object now exercises the real offline path |

Total UC-A unit tests executed: **269** (119 server, 150 client), **269 passed**.

By type: **101 Positive, 71 Negative, 45 Edge, 52 Error.**

The database-backed patrol tests in `server/tests/integration/patrols.integration.test.ts` are integration tests. They were not run in this phase because they need a separate test database.

### Coverage

Measured with Jest (server) and Vitest V8 (client).

| Area | Before: Stmts / Branch / Funcs / Lines | After: Stmts / Branch / Funcs / Lines |
|---|---|---|
| Server `src/modules/patrols` | 15.93 / 1.02 / 5.12 / 17.27 | **100 / 85.85 / 100 / 100** |
| Client `src/features/patrols` (whole feature) | not measured separately | **95.65 / 88.26 / 91.95 / 95.65** |
| Client `patrols/api` | 26.96 / 44.44 / 26.66 / 26.96 | 99.26 / 91.85 / 100 / 99.26 |
| Client `patrols/hooks` | 1.52 / 100 / 0 / 1.52 | 98.47 / 90.09 / 100 / 98.47 |
| Client `patrols/pages` | 3.37 / 50 / 50 / 3.37 | 97.75 / 81.86 / 85.29 / 97.75 |
| Client `patrols/components` | 63.50 / 57.53 / 62.50 / 63.50 | 98.35 / 92.51 / 95.83 / 98.35 |
| Server overall | 59.98 / 54.71 / 66.50 / 64.29 | 70.99 / 62.34 / 75.23 / 75.00 |
| Client overall | 69.55 / 79.47 / 65.92 / 69.55 | 83.52 / 83.37 / 72.79 / 83.52 |

`client/src/features/patrols/types/patrol.ts` contains only TypeScript interfaces, so it has no runtime code and reports 0%. It is still counted in the whole-feature figure.

### Defects found and fixed

| # | File | Defect | Fix | Regression tests |
|---|---|---|---|---|
| 1 | `client/src/features/patrols/api/patrolApi.ts` | Offline changes to a patrol were lost. Queue items were added without a `clientId`, so the shared sync queue merged later offline updates into the first pending item, which kept its old snapshot. A patrol completed offline with three waypoints reached the server as ACTIVE with one waypoint, and the sync then overwrote the complete local copy. Different offline patrols could also be merged into one queue item. | Queue items carry the session's `clientSessionId`, and the `PATROL_SESSION` transport uploads the latest local session from IndexedDB. | "reconnecting uploads the complete offline patrol and keeps every waypoint locally"; "two patrols recorded offline are both uploaded" |
| 2 | `client/src/features/patrols/api/patrolApi.ts` | Cancelling a patrol offline was saved on the device but never queued, so the server kept the patrol ACTIVE. | The offline cancel path queues an `UPDATE`. | "cancelPatrol cancels locally and queues the cancellation for sync"; "an offline cancellation of an online patrol reaches the server" |
| 3 | `server/src/modules/patrols/service.ts` | A CANCELLED patrol could be completed, which changed it to COMPLETED and marked its assignment COMPLETED. | `completePatrol` rejects CANCELLED sessions, mirroring the existing rule that completed patrols cannot be cancelled. | "rejects completing a CANCELLED patrol" |
| 4 | `client/src/shared/geolocation/geolocation.ts` | Without a Geolocation API, starting GPS tracking threw a `TypeError`, which crashed the Active Patrol screen. | Tracking reports `{ code: 0, message: 'Geolocation unavailable' }` through the error callback, as `getCurrentPosition` already did. | "tracking without a Geolocation API reports it as an error instead of throwing" |

Each regression test was confirmed to fail against the code before the fix.

### Known gaps (not changed in this phase)

- Any failed request in `patrolApi.ts`, including a server rejection such as "a patrol is already active", is treated as lost connectivity, and the action is saved locally as PENDING. The test "a server rejection while starting is treated like lost connectivity…" records this current behaviour.
- Pausing or resuming offline is stored locally but not queued. It reaches the server only with the next queued change to the same patrol.
- Patrol business-rule violations are plain `Error`s, which the shared error handler returns as HTTP 500 rather than 4xx.
- An invalid waypoint timestamp string passes validation and becomes an invalid date.
- `client/src/features/patrols/api/patrolApi.ts` always sends the built-in assignment id when starting a patrol. The server resolves the ranger's own assignment, so this has no visible effect while each ranger has a single assignment.

### UC-A test cases

All rows below come from the Jest and Vitest JSON results of the final run. The type column was assigned by reviewing each test.

| Test ID | Use Case | Scenario | Type | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| UT-A001 | UC-A | Server · validation › UC-A startPatrolSchema | Positive | accepts an assignment, route and client session id | Behaved as expected | Pass |
| UT-A002 | UC-A | Server · validation › UC-A startPatrolSchema | Edge | accepts an empty body because the server resolves the ranger assignment | Behaved as expected | Pass |
| UT-A003 | UC-A | Server · validation › UC-A startPatrolSchema | Negative | rejects a non-string assignmentId | Behaved as expected | Pass |
| UT-A004 | UC-A | Server · validation › UC-A startPatrolSchema | Negative | rejects a non-string clientSessionId | Behaved as expected | Pass |
| UT-A005 | UC-A | Server · validation › UC-A addWaypointSchema | Positive | accepts a GPS waypoint and converts the timestamp to a Date | Behaved as expected | Pass |
| UT-A006 | UC-A | Server · validation › UC-A addWaypointSchema | Positive | accepts a manual waypoint with an observation note and an epoch timestamp | Behaved as expected | Pass |
| UT-A007 | UC-A | Server · validation › UC-A addWaypointSchema | Edge | accepts boundary coordinates latitude -90, longitude -180 | Behaved as expected | Pass |
| UT-A008 | UC-A | Server · validation › UC-A addWaypointSchema | Edge | accepts boundary coordinates latitude 90, longitude 180 | Behaved as expected | Pass |
| UT-A009 | UC-A | Server · validation › UC-A addWaypointSchema | Edge | accepts boundary coordinates latitude 0, longitude 0 | Behaved as expected | Pass |
| UT-A010 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects out-of-range latitude (case 1) | Behaved as expected | Pass |
| UT-A011 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects out-of-range latitude (case 2) | Behaved as expected | Pass |
| UT-A012 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects out-of-range longitude (case 1) | Behaved as expected | Pass |
| UT-A013 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects out-of-range longitude (case 2) | Behaved as expected | Pass |
| UT-A014 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects coordinates sent as strings instead of numbers | Behaved as expected | Pass |
| UT-A015 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects a waypoint missing latitude | Behaved as expected | Pass |
| UT-A016 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects a waypoint missing longitude | Behaved as expected | Pass |
| UT-A017 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects a waypoint missing timestamp | Behaved as expected | Pass |
| UT-A018 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects a waypoint missing source | Behaved as expected | Pass |
| UT-A019 | UC-A | Server · validation › UC-A addWaypointSchema | Negative | rejects an unsupported waypoint source | Behaved as expected | Pass |
| UT-A020 | UC-A | Server · validation › UC-A addWaypointSchema | Edge | accepts a 500-character note and rejects 501 characters | Behaved as expected | Pass |
| UT-A021 | UC-A | Server · validation › UC-A completePatrolSchema | Positive | uses the supplied end time | Behaved as expected | Pass |
| UT-A022 | UC-A | Server · validation › UC-A completePatrolSchema | Edge | defaults the end time to the server clock when omitted | Behaved as expected | Pass |
| UT-A023 | UC-A | Server · validation › UC-A completePatrolSchema | Negative | rejects a non-string, non-number end time | Behaved as expected | Pass |
| UT-A024 | UC-A | Server · validation › UC-A syncPatrolSchema (offline patrol upload) | Positive | accepts a completed offline session with mixed GPS and manual waypoints | Behaved as expected | Pass |
| UT-A025 | UC-A | Server · validation › UC-A syncPatrolSchema (offline patrol upload) | Edge | defaults missing waypoints, distance and duration for an active session | Behaved as expected | Pass |
| UT-A026 | UC-A | Server · validation › UC-A syncPatrolSchema (offline patrol upload) | Negative | requires the client session id used for idempotent retries | Behaved as expected | Pass |
| UT-A027 | UC-A | Server · validation › UC-A syncPatrolSchema (offline patrol upload) | Negative | rejects an unknown patrol status | Behaved as expected | Pass |
| UT-A028 | UC-A | Server · validation › UC-A syncPatrolSchema (offline patrol upload) | Negative | reports the exact invalid waypoint inside the uploaded track | Behaved as expected | Pass |
| UT-A029 | UC-A | Server · service › A. assigned patrol retrieval | Positive | returns the ranger assignment with route and park shaped for the client | Behaved as expected | Pass |
| UT-A030 | UC-A | Server · service › A. assigned patrol retrieval | Positive | includes the ranger in-progress session so the patrol can be resumed | Behaved as expected | Pass |
| UT-A031 | UC-A | Server · service › A. assigned patrol retrieval | Edge | a ranger without an assignment is given the scheduled route assignment | Behaved as expected | Pass |
| UT-A032 | UC-A | Server · service › A. assigned patrol retrieval | Edge | a first-time ranger gets the seeded route created when it does not exist yet | Behaved as expected | Pass |
| UT-A033 | UC-A | Server · service › A. assigned patrol retrieval | Error | propagates a database failure | Behaved as expected | Pass |
| UT-A034 | UC-A | Server · service › A. assigned patrol retrieval | Negative | getPatrolRoute shapes the route and rejects an unknown route | Behaved as expected | Pass |
| UT-A035 | UC-A | Server · service › B. start patrol | Positive | starts an ACTIVE, synced session for the ranger own assignment and activates the assignment | Behaved as expected | Pass |
| UT-A036 | UC-A | Server · service › B. start patrol | Positive | without an assignment id, uses the ranger ASSIGNED assignment | Behaved as expected | Pass |
| UT-A037 | UC-A | Server · service › B. start patrol | Negative | another ranger's assignment is never used; the ranger's own assignment is resolved instead | Behaved as expected | Pass |
| UT-A038 | UC-A | Server · service › B. start patrol | Negative | rejects a second start while a patrol is ACTIVE or PAUSED | Behaved as expected | Pass |
| UT-A039 | UC-A | Server · service › B. start patrol | Edge | a retried start with the same client session id returns the existing session (idempotent) | Behaved as expected | Pass |
| UT-A040 | UC-A | Server · service › B. start patrol | Error | fails when no assignment can be resolved for the ranger | Behaved as expected | Pass |
| UT-A041 | UC-A | Server · service › B. start patrol | Error | a failed session insert does not activate the assignment | Behaved as expected | Pass |
| UT-A042 | UC-A | Server · service › C/D. GPS and manual waypoints | Positive | records a GPS waypoint on the session and recalculates distance and duration | Behaved as expected | Pass |
| UT-A043 | UC-A | Server · service › C/D. GPS and manual waypoints | Positive | records a manual waypoint with its source and observation note | Behaved as expected | Pass |
| UT-A044 | UC-A | Server · service › C/D. GPS and manual waypoints | Edge | accepts boundary coordinates (-90, -180) | Behaved as expected | Pass |
| UT-A045 | UC-A | Server · service › C/D. GPS and manual waypoints | Edge | accepts boundary coordinates (90, 180) | Behaved as expected | Pass |
| UT-A046 | UC-A | Server · service › C/D. GPS and manual waypoints | Edge | uses the current time when a waypoint has no timestamp | Behaved as expected | Pass |
| UT-A047 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects invalid coordinates { latitude: 90.5 } before touching the database | Behaved as expected | Pass |
| UT-A048 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects invalid coordinates { latitude: -91 } before touching the database | Behaved as expected | Pass |
| UT-A049 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects invalid coordinates { longitude: 180.5 } before touching the database | Behaved as expected | Pass |
| UT-A050 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects invalid coordinates { longitude: -181 } before touching the database | Behaved as expected | Pass |
| UT-A051 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects an unknown session | Behaved as expected | Pass |
| UT-A052 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects a waypoint on another ranger's session | Behaved as expected | Pass |
| UT-A053 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects a waypoint while the session is PAUSED | Behaved as expected | Pass |
| UT-A054 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects a waypoint while the session is COMPLETED | Behaved as expected | Pass |
| UT-A055 | UC-A | Server · service › C/D. GPS and manual waypoints | Negative | rejects a waypoint while the session is CANCELLED | Behaved as expected | Pass |
| UT-A056 | UC-A | Server · service › C/D. GPS and manual waypoints | Error | propagates a waypoint write failure without updating the session totals | Behaved as expected | Pass |
| UT-A057 | UC-A | Server · service › E. pause and resume | Positive | pauses an ACTIVE session and resumes a PAUSED session | Behaved as expected | Pass |
| UT-A058 | UC-A | Server · service › E. pause and resume | Negative | rejects pausing a session that is already paused | Behaved as expected | Pass |
| UT-A059 | UC-A | Server · service › E. pause and resume | Negative | rejects resuming a session that is not paused | Behaved as expected | Pass |
| UT-A060 | UC-A | Server · service › E. pause and resume | Negative | pausePatrol rejects unknown and foreign sessions | Behaved as expected | Pass |
| UT-A061 | UC-A | Server · service › E. pause and resume | Negative | resumePatrol rejects unknown and foreign sessions | Behaved as expected | Pass |
| UT-A062 | UC-A | Server · service › F. complete patrol | Positive | completes an ACTIVE patrol with end time, duration, distance and completed assignment | Behaved as expected | Pass |
| UT-A063 | UC-A | Server · service › F. complete patrol | Edge | records the distance for a patrol with no waypoints | Behaved as expected | Pass |
| UT-A064 | UC-A | Server · service › F. complete patrol | Edge | records the distance for a patrol with one waypoint | Behaved as expected | Pass |
| UT-A065 | UC-A | Server · service › F. complete patrol | Edge | records the distance for a patrol with two waypoints | Behaved as expected | Pass |
| UT-A066 | UC-A | Server · service › F. complete patrol | Edge | a PAUSED patrol can be completed | Behaved as expected | Pass |
| UT-A067 | UC-A | Server · service › F. complete patrol | Edge | an end time before the start never produces a negative duration | Behaved as expected | Pass |
| UT-A068 | UC-A | Server · service › F. complete patrol | Negative | rejects an already COMPLETED patrol | Behaved as expected | Pass |
| UT-A069 | UC-A | Server · service › F. complete patrol | Negative | rejects completing a CANCELLED patrol | Behaved as expected | Pass |
| UT-A070 | UC-A | Server · service › F. complete patrol | Negative | rejects unknown and foreign sessions (case 1) | Behaved as expected | Pass |
| UT-A071 | UC-A | Server · service › F. complete patrol | Error | propagates an update failure and leaves the assignment untouched | Behaved as expected | Pass |
| UT-A072 | UC-A | Server · service › G. cancel patrol | Positive | cancels a ACTIVE patrol and returns the assignment to ASSIGNED | Behaved as expected | Pass |
| UT-A073 | UC-A | Server · service › G. cancel patrol | Positive | cancels a PAUSED patrol and returns the assignment to ASSIGNED | Behaved as expected | Pass |
| UT-A074 | UC-A | Server · service › G. cancel patrol | Negative | rejects cancelling a COMPLETED patrol | Behaved as expected | Pass |
| UT-A075 | UC-A | Server · service › G. cancel patrol | Negative | rejects unknown and foreign sessions (case 2) | Behaved as expected | Pass |
| UT-A076 | UC-A | Server · service › session reads | Negative | getPatrolSession returns the ranger's session and rejects others | Behaved as expected | Pass |
| UT-A077 | UC-A | Server · service › session reads | Positive | getPatrolHistory lists only the ranger's sessions, newest first | Behaved as expected | Pass |
| UT-A078 | UC-A | Server · service › offline patrol synchronisation | Positive | creates a synced session from a completed offline patrol with all waypoints | Behaved as expected | Pass |
| UT-A079 | UC-A | Server · service › offline patrol synchronisation | Positive | an ACTIVE offline patrol keeps the client duration and activates the assignment | Behaved as expected | Pass |
| UT-A080 | UC-A | Server · service › offline patrol synchronisation | Edge | a retried sync replaces the waypoints of the existing session instead of duplicating it | Behaved as expected | Pass |
| UT-A081 | UC-A | Server · service › offline patrol synchronisation | Edge | a client-only (stale) assignment id is resolved to the ranger server assignment | Behaved as expected | Pass |
| UT-A082 | UC-A | Server · service › offline patrol synchronisation | Negative | rejects syncing onto another ranger's assignment | Behaved as expected | Pass |
| UT-A083 | UC-A | Server · service › offline patrol synchronisation | Error | fails when no assignment can be resolved | Behaved as expected | Pass |
| UT-A084 | UC-A | Server · service › offline patrol synchronisation | Error | propagates a database failure during sync | Behaved as expected | Pass |
| UT-A085 | UC-A | Server · distance › UC-A patrol distance calculations | Positive | calculateHaversineDistanceKm calculates distance between two points accurately | Behaved as expected | Pass |
| UT-A086 | UC-A | Server · distance › UC-A patrol distance calculations | Edge | identical points are 0 km apart | Behaved as expected | Pass |
| UT-A087 | UC-A | Server · distance › UC-A patrol distance calculations | Edge | handles boundary coordinates: pole to pole and across the antimeridian | Behaved as expected | Pass |
| UT-A088 | UC-A | Server · distance › UC-A patrol distance calculations | Edge | calculateTotalWaypointsDistanceKm returns 0 for empty or single waypoint | Behaved as expected | Pass |
| UT-A089 | UC-A | Server · distance › UC-A patrol distance calculations | Positive | calculateTotalWaypointsDistanceKm sums distances correctly across multiple waypoints | Behaved as expected | Pass |
| UT-A090 | UC-A | Server · distance › UC-A patrol distance calculations | Edge | a track that returns to its start counts both legs | Behaved as expected | Pass |
| UT-A091 | UC-A | Server · HTTP routes | Positive | GET /my-assignment uses the ranger headers | Behaved as expected | Pass |
| UT-A092 | UC-A | Server · HTTP routes | Edge | requests without ranger headers fall back to the demo ranger | Behaved as expected | Pass |
| UT-A093 | UC-A | Server · HTTP routes | Positive | POST /sessions starts a patrol with 201 and forwards the assignment and client session id | Behaved as expected | Pass |
| UT-A094 | UC-A | Server · HTTP routes | Negative | POST /sessions rejects a malformed body with 400 before starting a patrol | Behaved as expected | Pass |
| UT-A095 | UC-A | Server · HTTP routes | Positive | POST /waypoints passes a validated waypoint with a Date timestamp | Behaved as expected | Pass |
| UT-A096 | UC-A | Server · HTTP routes | Negative | POST /waypoints returns 400 for latitude out of range | Behaved as expected | Pass |
| UT-A097 | UC-A | Server · HTTP routes | Negative | POST /waypoints returns 400 for longitude out of range | Behaved as expected | Pass |
| UT-A098 | UC-A | Server · HTTP routes | Negative | POST /waypoints returns 400 for unknown source | Behaved as expected | Pass |
| UT-A099 | UC-A | Server · HTTP routes | Edge | POST /complete defaults the end time when the client sends none | Behaved as expected | Pass |
| UT-A100 | UC-A | Server · HTTP routes | Positive | POST /pause acts on the ranger session | Behaved as expected | Pass |
| UT-A101 | UC-A | Server · HTTP routes | Positive | POST /resume acts on the ranger session | Behaved as expected | Pass |
| UT-A102 | UC-A | Server · HTTP routes | Positive | POST /cancel acts on the ranger session | Behaved as expected | Pass |
| UT-A103 | UC-A | Server · HTTP routes | Positive | GET /routes/:routeId and GET /sessions/:sessionId return the requested records | Behaved as expected | Pass |
| UT-A104 | UC-A | Server · HTTP routes | Positive | POST /sessions/sync validates and forwards an offline patrol | Behaved as expected | Pass |
| UT-A105 | UC-A | Server · HTTP routes | Negative | POST /sessions/sync rejects an upload without a client session id | Behaved as expected | Pass |
| UT-A106 | UC-A | Server · HTTP routes | Error | service error "Patrol session not found." is returned as HTTP 404 with its message | Behaved as expected | Pass |
| UT-A107 | UC-A | Server · HTTP routes | Negative | service error "Unauthorized: Patrol session does not belong to this ranger." is returned as HTTP 403 with its message | Behaved as expected | Pass |
| UT-A108 | UC-A | Server · HTTP routes | Error | service error "Cannot add waypoints to a patrol session that is not ACTIVE." is returned as HTTP 500 with its message | Behaved as expected | Pass |
| UT-A109 | UC-A | Server · HTTP routes | Error | get /api/patrols/my-assignment returns the service failure as an error response | Behaved as expected | Pass |
| UT-A110 | UC-A | Server · HTTP routes | Error | get /api/patrols/routes/route-1 returns the service failure as an error response | Behaved as expected | Pass |
| UT-A111 | UC-A | Server · HTTP routes | Error | post /api/patrols/sessions returns the service failure as an error response | Behaved as expected | Pass |
| UT-A112 | UC-A | Server · HTTP routes | Error | post /api/patrols/sessions/sess-1/complete returns the service failure as an error response | Behaved as expected | Pass |
| UT-A113 | UC-A | Server · HTTP routes | Error | post /api/patrols/sessions/sess-1/pause returns the service failure as an error response | Behaved as expected | Pass |
| UT-A114 | UC-A | Server · HTTP routes | Error | post /api/patrols/sessions/sess-1/resume returns the service failure as an error response | Behaved as expected | Pass |
| UT-A115 | UC-A | Server · HTTP routes | Error | post /api/patrols/sessions/sess-1/cancel returns the service failure as an error response | Behaved as expected | Pass |
| UT-A116 | UC-A | Server · HTTP routes | Error | get /api/patrols/sessions/sess-1 returns the service failure as an error response | Behaved as expected | Pass |
| UT-A117 | UC-A | Server · HTTP routes | Error | get /api/patrols/sessions/history returns the service failure as an error response | Behaved as expected | Pass |
| UT-A118 | UC-A | Server · HTTP routes | Error | a database failure during sync is returned as HTTP 500 | Behaved as expected | Pass |
| UT-A119 | UC-A | Server · HTTP routes | Edge | the legacy /api/patrol-sessions alias reaches the same handlers | Behaved as expected | Pass |
| UT-A120 | UC-A | Client · patrolApi › online patrol requests | Positive | getMyAssignment returns the server assignment and caches the active session as SYNCED | Behaved as expected | Pass |
| UT-A121 | UC-A | Client · patrolApi › online patrol requests | Edge | getMyAssignment closes stale local active sessions when the server reports none | Behaved as expected | Pass |
| UT-A122 | UC-A | Client · patrolApi › online patrol requests | Positive | getRouteById returns the server route | Behaved as expected | Pass |
| UT-A123 | UC-A | Client · patrolApi › online patrol requests | Positive | startPatrol posts the assignment with a new client session id and caches the session | Behaved as expected | Pass |
| UT-A124 | UC-A | Client · patrolApi › online patrol requests | Edge | each start uses a unique client session id | Behaved as expected | Pass |
| UT-A125 | UC-A | Client · patrolApi › online patrol requests | Positive | addWaypoint posts the waypoint and stores the server session locally | Behaved as expected | Pass |
| UT-A126 | UC-A | Client · patrolApi › online patrol requests | Negative | addWaypoint rejects { latitude: 90.1 } without a request | Behaved as expected | Pass |
| UT-A127 | UC-A | Client · patrolApi › online patrol requests | Negative | addWaypoint rejects { latitude: -90.1 } without a request | Behaved as expected | Pass |
| UT-A128 | UC-A | Client · patrolApi › online patrol requests | Negative | addWaypoint rejects { longitude: 180.1 } without a request | Behaved as expected | Pass |
| UT-A129 | UC-A | Client · patrolApi › online patrol requests | Negative | addWaypoint rejects { longitude: -180.1 } without a request | Behaved as expected | Pass |
| UT-A130 | UC-A | Client · patrolApi › online patrol requests | Positive | pausePatrol calls its endpoint and marks the local session SYNCED | Behaved as expected | Pass |
| UT-A131 | UC-A | Client · patrolApi › online patrol requests | Positive | resumePatrol calls its endpoint and marks the local session SYNCED | Behaved as expected | Pass |
| UT-A132 | UC-A | Client · patrolApi › online patrol requests | Positive | cancelPatrol sends the reason and stores the cancelled session | Behaved as expected | Pass |
| UT-A133 | UC-A | Client · patrolApi › online patrol requests | Positive | completePatrol sends the end time, stores the result and closes other stale local patrols | Behaved as expected | Pass |
| UT-A134 | UC-A | Client · patrolApi › online patrol requests | Positive | getSessionById returns the server session | Behaved as expected | Pass |
| UT-A135 | UC-A | Client · patrolApi › online patrol requests | Positive | getPatrolHistory caches server sessions that are not stored locally yet | Behaved as expected | Pass |
| UT-A136 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | getMyAssignment falls back to the scheduled assignment and the cached in-progress session | Behaved as expected | Pass |
| UT-A137 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | getRouteById falls back to the offline route | Behaved as expected | Pass |
| UT-A138 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | startPatrol creates a PENDING local session and queues a CREATE sync item | Behaved as expected | Pass |
| UT-A139 | UC-A | Client · patrolApi › offline patrol behaviour | Error | a server rejection while starting is treated like lost connectivity and the patrol starts locally | Behaved as expected | Pass |
| UT-A140 | UC-A | Client · patrolApi › offline patrol behaviour | Error | startPatrol reports a device storage failure instead of losing the patrol silently | Behaved as expected | Pass |
| UT-A141 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | GPS and manual waypoints are appended locally with distance, kept PENDING and queued | Behaved as expected | Pass |
| UT-A142 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | addWaypoint fails clearly when the session is not stored on the device | Behaved as expected | Pass |
| UT-A143 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | a COMPLETED patrol accepts no further offline waypoints | Behaved as expected | Pass |
| UT-A144 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | a CANCELLED patrol accepts no further offline waypoints | Behaved as expected | Pass |
| UT-A145 | UC-A | Client · patrolApi › offline patrol behaviour | Error | addWaypoint reports a device storage failure | Behaved as expected | Pass |
| UT-A146 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | completePatrol completes locally with duration and distance, and queues the change | Behaved as expected | Pass |
| UT-A147 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | completePatrol fails clearly for a session that is not on the device | Behaved as expected | Pass |
| UT-A148 | UC-A | Client · patrolApi › offline patrol behaviour | Error | completePatrol reports a failure to queue the completion | Behaved as expected | Pass |
| UT-A149 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | pause and resume change the local status and mark it PENDING | Behaved as expected | Pass |
| UT-A150 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | pausePatrol fails clearly for a session that is not on the device | Behaved as expected | Pass |
| UT-A151 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | resumePatrol fails clearly for a session that is not on the device | Behaved as expected | Pass |
| UT-A152 | UC-A | Client · patrolApi › offline patrol behaviour | Negative | cancelPatrol fails clearly for a session that is not on the device | Behaved as expected | Pass |
| UT-A153 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | cancelPatrol cancels locally and queues the cancellation for sync | Behaved as expected | Pass |
| UT-A154 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | getSessionById serves the stored session, and fails when there is none | Behaved as expected | Pass |
| UT-A155 | UC-A | Client · patrolApi › offline patrol behaviour | Edge | getPatrolHistory seeds the demo history on an empty device | Behaved as expected | Pass |
| UT-A156 | UC-A | Client · patrolApi › offline patrol behaviour | Positive | getPatrolHistory lists stored sessions newest first | Behaved as expected | Pass |
| UT-A157 | UC-A | Client · patrolApi › patrol synchronisation | Positive | syncSessionPayload uploads the mapped session and marks the local copy SYNCED | Behaved as expected | Pass |
| UT-A158 | UC-A | Client · patrolApi › patrol synchronisation | Edge | syncSessionPayload falls back to the local id and sends an empty track when there are no waypoints | Behaved as expected | Pass |
| UT-A159 | UC-A | Client · patrolApi › patrol synchronisation | Error | a failed upload keeps the local patrol unchanged | Behaved as expected | Pass |
| UT-A160 | UC-A | Client · patrolApi › patrol synchronisation | Positive | reconnecting uploads the complete offline patrol and keeps every waypoint locally | Behaved as expected | Pass |
| UT-A161 | UC-A | Client · patrolApi › patrol synchronisation | Edge | two patrols recorded offline are both uploaded | Behaved as expected | Pass |
| UT-A162 | UC-A | Client · patrolApi › patrol synchronisation | Positive | an offline cancellation of an online patrol reaches the server | Behaved as expected | Pass |
| UT-A163 | UC-A | Client · patrolApi › patrol synchronisation | Error | a rejected upload marks the queue item FAILED but never deletes the local patrol | Behaved as expected | Pass |
| UT-A164 | UC-A | Client · patrolApi › patrol synchronisation | Error | a lost connection during upload keeps the items PENDING for an automatic retry | Behaved as expected | Pass |
| UT-A165 | UC-A | Client · usePatrol › loading | Positive | starts loading, then exposes the assignment without a session | Behaved as expected | Pass |
| UT-A166 | UC-A | Client · usePatrol › loading | Positive | loads a specific session when a session id is given | Behaved as expected | Pass |
| UT-A167 | UC-A | Client · usePatrol › loading | Error | represents a load failure as an error message | Behaved as expected | Pass |
| UT-A168 | UC-A | Client · usePatrol › loading | Positive | reloads when a background sync completes or connectivity returns | Behaved as expected | Pass |
| UT-A169 | UC-A | Client · usePatrol › loading | Edge | selectAssignment switches only to a known assignment | Behaved as expected | Pass |
| UT-A170 | UC-A | Client · usePatrol › starting a patrol | Positive | starts the selected assignment and begins GPS tracking | Behaved as expected | Pass |
| UT-A171 | UC-A | Client · usePatrol › starting a patrol | Positive | a patrol started offline is exposed as pending synchronisation | Behaved as expected | Pass |
| UT-A172 | UC-A | Client · usePatrol › starting a patrol | Error | a start failure is reported and rethrown | Behaved as expected | Pass |
| UT-A173 | UC-A | Client · usePatrol › GPS tracking | Positive | a GPS fix updates the position and auto-records a GPS waypoint | Behaved as expected | Pass |
| UT-A174 | UC-A | Client · usePatrol › GPS tracking | Edge | records at most one automatic waypoint every 10 seconds | Behaved as expected | Pass |
| UT-A175 | UC-A | Client · usePatrol › GPS tracking | Negative | ignores an invalid GPS fix | Behaved as expected | Pass |
| UT-A176 | UC-A | Client · usePatrol › GPS tracking | Error | a failed automatic waypoint does not stop tracking | Behaved as expected | Pass |
| UT-A177 | UC-A | Client · usePatrol › GPS tracking | Error | GPS error { code: 1, message: 'denied' } sets state denied | Behaved as expected | Pass |
| UT-A178 | UC-A | Client · usePatrol › GPS tracking | Error | GPS error { code: 2, message: 'no fix' } sets state unavailable | Behaved as expected | Pass |
| UT-A179 | UC-A | Client · usePatrol › GPS tracking | Error | GPS error { code: +0, message: 'Geolocation unavailable' } sets state error | Behaved as expected | Pass |
| UT-A180 | UC-A | Client · usePatrol › GPS tracking | Error | GPS error { code: 3, message: '' } sets state error | Behaved as expected | Pass |
| UT-A181 | UC-A | Client · usePatrol › GPS tracking | Edge | a fix after a GPS error restores the tracking state | Behaved as expected | Pass |
| UT-A182 | UC-A | Client · usePatrol › GPS tracking | Positive | stops the GPS watch when the hook unmounts and removes its listeners | Behaved as expected | Pass |
| UT-A183 | UC-A | Client · usePatrol › GPS tracking | Positive | shows the elapsed patrol time | Behaved as expected | Pass |
| UT-A184 | UC-A | Client · usePatrol › manual waypoints | Positive | records manually entered coordinates with a note | Behaved as expected | Pass |
| UT-A185 | UC-A | Client · usePatrol › manual waypoints | Positive | uses the current GPS position when no coordinates are entered | Behaved as expected | Pass |
| UT-A186 | UC-A | Client · usePatrol › manual waypoints | Negative | without GPS or entered coordinates the waypoint is refused | Behaved as expected | Pass |
| UT-A187 | UC-A | Client · usePatrol › manual waypoints | Negative | requires an active patrol | Behaved as expected | Pass |
| UT-A188 | UC-A | Client · usePatrol › manual waypoints | Error | a failed manual waypoint is reported | Behaved as expected | Pass |
| UT-A189 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Positive | pausing stops GPS tracking and resuming restarts it | Behaved as expected | Pass |
| UT-A190 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Positive | completing stops tracking and stores the completed session | Behaved as expected | Pass |
| UT-A191 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Positive | cancelling passes the reason and stores the cancelled session | Behaved as expected | Pass |
| UT-A192 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Error | pausePatrol reports an API failure | Behaved as expected | Pass |
| UT-A193 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Error | resumePatrol reports an API failure | Behaved as expected | Pass |
| UT-A194 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Error | cancelPatrol reports an API failure | Behaved as expected | Pass |
| UT-A195 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Error | completePatrol reports an API failure | Behaved as expected | Pass |
| UT-A196 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Negative | pausePatrol is refused without an in-progress patrol | Behaved as expected | Pass |
| UT-A197 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Negative | resumePatrol is refused without an in-progress patrol | Behaved as expected | Pass |
| UT-A198 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Negative | cancelPatrol is refused without an in-progress patrol | Behaved as expected | Pass |
| UT-A199 | UC-A | Client · usePatrol › pause, resume, cancel and complete | Negative | completePatrol is refused without an in-progress patrol | Behaved as expected | Pass |
| UT-A200 | UC-A | Client · pages › AssignedPatrolPage | Positive | shows loading, then the assigned route ready to start | Behaved as expected | Pass |
| UT-A201 | UC-A | Client · pages › AssignedPatrolPage | Positive | Start Patrol starts the assignment and opens live tracking | Behaved as expected | Pass |
| UT-A202 | UC-A | Client · pages › AssignedPatrolPage | Error | a failed start is reported and the ranger stays on the page | Behaved as expected | Pass |
| UT-A203 | UC-A | Client · pages › AssignedPatrolPage | Positive | a paused patrol is announced and Resume Patrol resumes it before opening tracking | Behaved as expected | Pass |
| UT-A204 | UC-A | Client · pages › AssignedPatrolPage | Positive | an active patrol opens tracking directly without another start | Behaved as expected | Pass |
| UT-A205 | UC-A | Client · pages › AssignedPatrolPage | Negative | another route cannot be started while a patrol is in progress | Behaved as expected | Pass |
| UT-A206 | UC-A | Client · pages › AssignedPatrolPage | Edge | a ranger without assignments sees the no-assignment message | Behaved as expected | Pass |
| UT-A207 | UC-A | Client · pages › AssignedPatrolPage | Error | a load failure shows the error | Behaved as expected | Pass |
| UT-A208 | UC-A | Client · pages › AssignedPatrolPage | Positive | history lists finished patrols with their sync state and opens a summary | Behaved as expected | Pass |
| UT-A209 | UC-A | Client · pages › AssignedPatrolPage | Edge | an empty history explains how patrols appear | Behaved as expected | Pass |
| UT-A210 | UC-A | Client · pages › PatrolRoutePage | Positive | shows the route details and map, and starts a patrol from the route | Behaved as expected | Pass |
| UT-A211 | UC-A | Client · pages › PatrolRoutePage | Positive | a patrol in progress on this route is resumed instead of started | Behaved as expected | Pass |
| UT-A212 | UC-A | Client · pages › PatrolRoutePage | Error | a route that cannot be loaded shows an error with a way back | Behaved as expected | Pass |
| UT-A213 | UC-A | Client · pages › PatrolRoutePage | Error | a failed start keeps the ranger on the route page | Behaved as expected | Pass |
| UT-A214 | UC-A | Client · pages › ActivePatrolPage | Positive | shows the live patrol metrics and the GPS fix | Behaved as expected | Pass |
| UT-A215 | UC-A | Client · pages › ActivePatrolPage | Error | a denied GPS permission is shown while the patrol continues | Behaved as expected | Pass |
| UT-A216 | UC-A | Client · pages › ActivePatrolPage | Positive | the ranger can record a manual waypoint with coordinates and a note | Behaved as expected | Pass |
| UT-A217 | UC-A | Client · pages › ActivePatrolPage | Positive | pausing shows the paused state and disables manual waypoints | Behaved as expected | Pass |
| UT-A218 | UC-A | Client · pages › ActivePatrolPage | Positive | ending the patrol asks for confirmation, completes it and opens the summary | Behaved as expected | Pass |
| UT-A219 | UC-A | Client · pages › ActivePatrolPage | Error | a completion failure is reported and the ranger is not sent to the summary | Behaved as expected | Pass |
| UT-A220 | UC-A | Client · pages › ActivePatrolPage | Positive | cancelling with a reason cancels the patrol and returns to the patrol list | Behaved as expected | Pass |
| UT-A221 | UC-A | Client · pages › ActivePatrolPage | Positive | Go Back closes the cancel dialog without cancelling | Behaved as expected | Pass |
| UT-A222 | UC-A | Client · pages › ActivePatrolPage | Positive | Report Threat opens incident reporting linked to this patrol | Behaved as expected | Pass |
| UT-A223 | UC-A | Client · pages › ActivePatrolPage | Edge | losing connectivity is shown on the tracking screen | Behaved as expected | Pass |
| UT-A224 | UC-A | Client · pages › ActivePatrolPage | Negative | an unknown session shows an error with a way back | Behaved as expected | Pass |
| UT-A225 | UC-A | Client · pages › PatrolCompletionPage | Positive | a synced patrol shows its completed summary | Behaved as expected | Pass |
| UT-A226 | UC-A | Client · pages › PatrolCompletionPage | Positive | a patrol completed offline is shown as saved locally and pending synchronisation | Behaved as expected | Pass |
| UT-A227 | UC-A | Client · pages › PatrolCompletionPage | Positive | Return to My Patrol goes back to the patrol list | Behaved as expected | Pass |
| UT-A228 | UC-A | Client · pages › PatrolCompletionPage | Error | a summary that cannot be loaded shows an error | Behaved as expected | Pass |
| UT-A229 | UC-A | Client · components › GPSStatus | Positive | tracking shows the coordinates and accuracy of the current fix | Behaved as expected | Pass |
| UT-A230 | UC-A | Client · components › GPSStatus | Error | denied state shows its label and the problem | Behaved as expected | Pass |
| UT-A231 | UC-A | Client · components › GPSStatus | Error | error state shows its label and the problem | Behaved as expected | Pass |
| UT-A232 | UC-A | Client · components › GPSStatus | Edge | idle state waits for a fix | Behaved as expected | Pass |
| UT-A233 | UC-A | Client · components › PatrolStatusBadge and SyncStatusIndicator | Positive | sync status SYNCING is shown as "🔄 Syncing..." | Behaved as expected | Pass |
| UT-A234 | UC-A | Client · components › PatrolStatusBadge and SyncStatusIndicator | Positive | sync status FAILED is shown as "🟠 Sync Failed (Retrying)" | Behaved as expected | Pass |
| UT-A235 | UC-A | Client · components › PatrolStatusBadge and SyncStatusIndicator | Positive | sync status LOCAL is shown as "🟡 Saved Locally (Pending Sync)" | Behaved as expected | Pass |
| UT-A236 | UC-A | Client · components › PatrolStatusBadge and SyncStatusIndicator | Edge | without a sync status only the patrol status is shown | Behaved as expected | Pass |
| UT-A237 | UC-A | Client · components › PatrolStatusBadge and SyncStatusIndicator | Positive | the connectivity indicator follows offline and online events | Behaved as expected | Pass |
| UT-A238 | UC-A | Client · components › PatrolCard | Positive | an assigned route offers Start Patrol and View Route Map | Behaved as expected | Pass |
| UT-A239 | UC-A | Client · components › PatrolCard | Positive | an in-progress patrol shows its status and offers to continue | Behaved as expected | Pass |
| UT-A240 | UC-A | Client · components › PatrolCard | Negative | another patrol in progress blocks starting this one | Behaved as expected | Pass |
| UT-A241 | UC-A | Client · components › PatrolCard | Edge | a route without park details falls back to the default park name | Behaved as expected | Pass |
| UT-A242 | UC-A | Client · components › WaypointFormModal | Positive | GPS mode records the current fix with the observation note | Behaved as expected | Pass |
| UT-A243 | UC-A | Client · components › WaypointFormModal | Edge | without GPS the form opens in manual mode with the GPS warning available | Behaved as expected | Pass |
| UT-A244 | UC-A | Client · components › WaypointFormModal | Negative | rejects manual coordinates (95, 80.88) with a validation message | Behaved as expected | Pass |
| UT-A245 | UC-A | Client · components › WaypointFormModal | Negative | rejects manual coordinates (6.475, -181) with a validation message | Behaved as expected | Pass |
| UT-A246 | UC-A | Client · components › WaypointFormModal | Negative | a blank manual coordinate is rejected | Behaved as expected | Pass |
| UT-A247 | UC-A | Client · components › WaypointFormModal | Error | a failed save shows the error and lets the ranger retry | Behaved as expected | Pass |
| UT-A248 | UC-A | Client · components › WaypointFormModal | Positive | Cancel closes the form without recording | Behaved as expected | Pass |
| UT-A249 | UC-A | Client · components › PatrolMap | Positive | draws the assigned route in [lat, lng] order with start and end markers | Behaved as expected | Pass |
| UT-A250 | UC-A | Client · components › PatrolMap | Positive | marks GPS and manual waypoints differently, shows notes and draws the recorded track | Behaved as expected | Pass |
| UT-A251 | UC-A | Client · components › PatrolMap | Edge | ignores waypoints with invalid coordinates and draws no track for a single point | Behaved as expected | Pass |
| UT-A252 | UC-A | Client · components › PatrolMap | Positive | shows and centres on the ranger current location, fitting all points in view | Behaved as expected | Pass |
| UT-A253 | UC-A | Client · components › PatrolMap | Edge | with no route or waypoints it shows the default park view without markers | Behaved as expected | Pass |
| UT-A254 | UC-A | Client · geolocation › GeolocationService with an injected provider | Positive | delegates fixes, tracking and stopping to the provider | Behaved as expected | Pass |
| UT-A255 | UC-A | Client · geolocation › browser geolocation provider | Positive | maps a successful position fix | Behaved as expected | Pass |
| UT-A256 | UC-A | Client · geolocation › browser geolocation provider | Error | maps a permission-denied error | Behaved as expected | Pass |
| UT-A257 | UC-A | Client · geolocation › browser geolocation provider | Error | rejects a fix when the device has no Geolocation API | Behaved as expected | Pass |
| UT-A258 | UC-A | Client · geolocation › browser geolocation provider | Positive | watch callbacks receive mapped positions and errors, and the watch can be cleared | Behaved as expected | Pass |
| UT-A259 | UC-A | Client · geolocation › browser geolocation provider | Error | tracking without a Geolocation API reports it as an error instead of throwing | Behaved as expected | Pass |
| UT-A260 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | renders PatrolStatusBadge with distinct SYNCED and PENDING statuses | Behaved as expected | Pass |
| UT-A261 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Error | GPSStatus displays GPS Signal Lost state without terminating patrol | Behaved as expected | Pass |
| UT-A262 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Negative | addWaypoint rejects invalid GPS coordinates (lat < -90 or > 90) | Behaved as expected | Pass |
| UT-A263 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | validates offline session payload format for PENDING synchronization | Behaved as expected | Pass |
| UT-A264 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | PatrolCard renders assignment details, route name, distance and buttons | Behaved as expected | Pass |
| UT-A265 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | WaypointFormModal handles user observation input and submission | Behaved as expected | Pass |
| UT-A266 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Edge | WaypointFormModal supports Manual Coordinates override mode when GPS is unavailable | Behaved as expected | Pass |
| UT-A267 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | SyncStatusIndicator displays Online network state | Behaved as expected | Pass |
| UT-A268 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Negative | manualWaypointSchema Zod validation enforces latitude and longitude constraints | Behaved as expected | Pass |
| UT-A269 | UC-A | Client · patrols (existing) › UC-A Patrol Component & Offline Sync Tests | Positive | calculateHaversineDistanceKm and calculateTotalWaypointsDistanceKm compute correctly | Behaved as expected | Pass |

## UC-B – Report & Manage Conservation Incidents

Results recorded on 9 October 2026 from the final code of this phase.

### Frameworks and isolation

- **Server:** Jest, ts-jest and Supertest. Prisma is replaced by `server/tests/incidentPrismaMock.ts`, and the reverse geocoder is stubbed, so no test reaches Neon or OpenStreetMap. Business-rule tests fix the clock with Jest fake timers.
- **Client:** Vitest, React Testing Library and userEvent. HTTP calls are mocked, while Dexie (on `fake-indexeddb`) and the shared `SyncService` run for real, so offline storage and synchronisation are exercised end to end on the device side.

### Test files

| File | Layer | Tests | Notes |
|---|---|---|---|
| `server/tests/incidentValidation.test.ts` | Server request validation (zod) | 44 | New |
| `server/tests/incidentService.test.ts` | Server incident service, Prisma mocked | 65 | New |
| `server/tests/incidentRoutes.test.ts` | Server HTTP controller, routes and error mapping (Supertest) | 21 | New |
| `server/tests/incidentPlaceNames.test.ts` | Server place-name lookup and background fill | 6 | New |
| `server/tests/incidentPrismaMock.ts` | Reusable Prisma mock for the incident module | – | Test helper |
| `server/tests/placeNames.test.ts` | Server reverse geocoder used for incident place names | 6 | Existing |
| `client/src/features/incidents/api/incidentApi.test.ts` | Incident API: online, offline (Dexie), sync, retry, discard | 36 | New |
| `client/src/features/incidents/utils/incidentUtils.test.ts` | Photo files, form schema, error wording, edit helpers | 68 | New |
| `client/src/features/incidents/components/IncidentComponents.test.tsx` | Photo manager, photo capture, delete dialog, Undo toast | 14 | New |
| `client/src/features/incidents/pages/IncidentPages.test.tsx` | Report, History and Edit pages | 26 | New |
| `client/src/features/incidents/Incidents.test.tsx` | Reporting | 10 | Existing |
| `client/src/features/incidents/EditIncident.test.tsx` | Editing | 15 | Existing |
| `client/src/features/incidents/DeleteIncident.test.tsx` | Withdraw and Undo | 8 | Existing |
| `client/src/features/incidents/ReportTimeAndLocation.test.tsx` | Report time and manual location input | 6 | Existing |

Total UC-B unit tests executed: **325** (142 server, 183 client), **325 passed**. Of these, 280 are new (136 server, 144 client).

By type: **95 Positive, 126 Negative, 44 Edge, 60 Error.**

The database-backed tests in `server/tests/integration/incidents.integration.test.ts` and `server/tests/integration/placeNames.integration.test.ts` are integration tests. They were kept and were not run in this phase because they need a separate test database.

### Scenarios covered

- **Creating a report:**
  - stored ranger, type, description, GPS or MANUAL location, photos, report time and default statuses
  - offline report times and the 5-minute clock-skew limit
  - linking to the named or covering patrol, and taking the park from that patrol
  - idempotent retries that never duplicate a report or bring back a withdrawn one
- **Validation:**
  - photos must be JPEG, PNG or WebP data URLs of at most 5 MB (tested at the exact byte boundary), matching their metadata, with 1 to 5 per report
  - coordinate boundaries, required fields, the 3–1000 character description and the "Other" threat name
  - edit, withdrawal and restore request bodies
- **Editing:**
  - only changed fields, with an audit revision
  - corrected locations within 5 km of the patrol track
  - photo replacement, never removing the last photo
  - conflicts from a stale version or a concurrent write
  - the exact 24-hour window, patrol and investigation locks, and offline edits judged by when they were made
- **Withdraw and restore:**
  - reason and note, a DELETE revision, idempotent retries, 410 for a second withdrawal
  - restore only while the report is still editable
- **Offline and synchronisation:**
  - a report without a connection is saved on the device as PENDING, never shown as SYNCED, and queued for upload
  - reconnecting uploads it with the original report time, location source, patrol, park and photos
  - a lost connection leaves the upload queued for an automatic retry; a server rejection marks it FAILED; Retry Sync records each failure and later succeeds
  - no failed synchronisation deletes a report or its photos
- **Server error versus lost connection:**
  - 400, 403, 409, 413 and 500 answers are shown to the ranger and never saved as offline reports
  - only a request with no response falls back to saving on the device
- **GPS and manual location on the Report page:**
  - a GPS fix is submitted as GPS
  - when permission is denied, the ranger pins the spot manually and it is submitted as MANUAL; a GPS fix can also be overridden by a manual pin

### Coverage

Measured with Jest (server, unit suites only) and Vitest V8 (client).

| Area | Before: Stmts / Branch / Funcs / Lines | After: Stmts / Branch / Funcs / Lines |
|---|---|---|
| Server `src/modules/incidents` | 28.16 / 19.45 / 30.76 / 31.41 | **99.43 / 92.97 / 100 / 100** |
| Client `src/features/incidents` (whole feature) | 80.09 / 77.01 / 68.71 / 80.09 | **92.98 / 89.76 / 83.33 / 92.98** |
| Client `incidents/api` | 52.38 / 70.00 / 66.66 / 52.38 | 97.11 / 88.81 / 100 / 97.11 |
| Client `incidents/pages` | 86.23 / 75.40 / 58.88 / 86.23 | 96.46 / 86.51 / 78.89 / 96.46 |
| Client `incidents/components` | 92.49 / 89.06 / 78.84 / 92.49 | 96.69 / 91.67 / 84.91 / 96.69 |
| Client `incidents/utils` | 85.32 / 60.67 / 86.36 / 85.32 | 98.80 / 98.18 / 90.91 / 98.80 |
| Server overall | 70.99 / 62.34 / 75.23 / 75.00 | 84.25 / 74.35 / 83.96 / 87.67 |
| Client overall | 83.52 / 83.37 / 72.79 / 83.52 | 86.94 / 86.89 / 77.33 / 86.94 |

"Before" for UC-B is the start of this phase; "before" for the overall figures is the end of the UC-A phase. `client/src/features/incidents/types/incident.ts` contains only TypeScript types and reports 0%; it is still counted in the whole-feature figure.

### Defect found and fixed

| File | Defect | Fix | Regression test |
|---|---|---|---|
| `client/src/features/incidents/api/incidentApi.ts` | Opening the report list ran a demo-data clean-up that deleted every report except the newest with one specific snare description, together with its queued upload, whatever its sync status. A ranger's genuine unsynced offline report was lost before it reached the server. | The clean-up now only considers SYNCED device copies, which are copies of server records. Unsynced reports are never removed by it. | "opening the list never deletes unsynced reports, even with identical descriptions" (confirmed to fail against the code before the fix) |

Network-failure handling was already correct for UC-B: only requests with no response fall back to an offline save. Regression tests now cover each server answer.

### Known gaps (not changed in this phase)

- For unexpected failures, the shared error handler returns HTTP 500 with the internal error message. This applies to every module.
- When an upload fails only because the connection was lost, the device copy is marked FAILED while its queue item stays PENDING for the automatic retry. The history page then shows "SYNC FAILED" for a report that will still upload by itself. No data is lost.
- Editing, withdrawing and restoring need a connection. Offline they report "OFFLINE", as designed.
- A 5xx answer when creating a report is shown as an error rather than saved for a later retry. The code documents this as intended.
- Offline reports use the demo ranger identity `R-101` until authentication exists.

### UC-B test cases

All rows below come from the Jest and Vitest JSON results of the final run. The type column was assigned by reviewing each test.

| Test ID | Use Case | Scenario | Type | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| UT-B001 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Positive | accepts a JPEG data URL | Behaved as expected | Pass |
| UT-B002 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Positive | accepts a PNG data URL | Behaved as expected | Pass |
| UT-B003 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Positive | accepts a WebP data URL | Behaved as expected | Pass |
| UT-B004 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects an unsupported image type | Behaved as expected | Pass |
| UT-B005 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects a plain file name | Behaved as expected | Pass |
| UT-B006 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects a remote URL | Behaved as expected | Pass |
| UT-B007 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects malformed base64 data | Behaved as expected | Pass |
| UT-B008 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects a data URL without base64 encoding | Behaved as expected | Pass |
| UT-B009 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | rejects an empty photo | Behaved as expected | Pass |
| UT-B010 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Edge | accepts a photo of exactly 5 MB and rejects one byte more | Behaved as expected | Pass |
| UT-B011 | UC-B | Server · validation › UC-B evidenceSchema (photo rules) | Negative | metadata must be real values that match the photo | Behaved as expected | Pass |
| UT-B012 | UC-B | Server · validation › UC-B createIncidentSchema | Positive | accepts a GPS report and defaults the location source to GPS | Behaved as expected | Pass |
| UT-B013 | UC-B | Server · validation › UC-B createIncidentSchema | Positive | accepts a manually pinned location, an offline report time and a client id | Behaved as expected | Pass |
| UT-B014 | UC-B | Server · validation › UC-B createIncidentSchema | Edge | accepts boundary coordinates (-90, -180) | Behaved as expected | Pass |
| UT-B015 | UC-B | Server · validation › UC-B createIncidentSchema | Edge | accepts boundary coordinates (90, 180) | Behaved as expected | Pass |
| UT-B016 | UC-B | Server · validation › UC-B createIncidentSchema | Edge | accepts boundary coordinates (0, 0) | Behaved as expected | Pass |
| UT-B017 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects an out-of-range latitude (case 1) | Behaved as expected | Pass |
| UT-B018 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects an out-of-range latitude (case 2) | Behaved as expected | Pass |
| UT-B019 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects an out-of-range longitude (case 1) | Behaved as expected | Pass |
| UT-B020 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects an out-of-range longitude (case 2) | Behaved as expected | Pass |
| UT-B021 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects coordinates sent as text | Behaved as expected | Pass |
| UT-B022 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | requires incidentType | Behaved as expected | Pass |
| UT-B023 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | requires description | Behaved as expected | Pass |
| UT-B024 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | requires latitude | Behaved as expected | Pass |
| UT-B025 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | requires longitude | Behaved as expected | Pass |
| UT-B026 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | requires evidence | Behaved as expected | Pass |
| UT-B027 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects an unsupported incident type and location source | Behaved as expected | Pass |
| UT-B028 | UC-B | Server · validation › UC-B createIncidentSchema | Edge | description is trimmed and must be 3 to 1000 characters | Behaved as expected | Pass |
| UT-B029 | UC-B | Server · validation › UC-B createIncidentSchema | Edge | requires at least one and at most five photos | Behaved as expected | Pass |
| UT-B030 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | reports the exact invalid photo | Behaved as expected | Pass |
| UT-B031 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | an "Other" threat must be named with at least 3 characters | Behaved as expected | Pass |
| UT-B032 | UC-B | Server · validation › UC-B createIncidentSchema | Negative | rejects a malformed report time and park id | Behaved as expected | Pass |
| UT-B033 | UC-B | Server · validation › UC-B updateIncidentSchema | Positive | accepts a single changed field with the concurrency metadata | Behaved as expected | Pass |
| UT-B034 | UC-B | Server · validation › UC-B updateIncidentSchema | Positive | accepts a corrected manual location and photo changes | Behaved as expected | Pass |
| UT-B035 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | rejects a request with no editable change | Behaved as expected | Pass |
| UT-B036 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | rejects fields that may not be edited | Behaved as expected | Pass |
| UT-B037 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | requires expectedUpdatedAt | Behaved as expected | Pass |
| UT-B038 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | requires editedAt | Behaved as expected | Pass |
| UT-B039 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | requires clientEditId | Behaved as expected | Pass |
| UT-B040 | UC-B | Server · validation › UC-B updateIncidentSchema | Negative | rejects an invalid location, an over-long edit id and more than five new photos | Behaved as expected | Pass |
| UT-B041 | UC-B | Server · validation › UC-B deleteIncidentSchema and restoreIncidentSchema | Positive | accepts a withdrawal with a reason, and "Other" with a note | Behaved as expected | Pass |
| UT-B042 | UC-B | Server · validation › UC-B deleteIncidentSchema and restoreIncidentSchema | Negative | a reason is required and "Other" needs a note of at least 3 characters | Behaved as expected | Pass |
| UT-B043 | UC-B | Server · validation › UC-B deleteIncidentSchema and restoreIncidentSchema | Negative | a withdrawal rejects unknown fields and malformed times | Behaved as expected | Pass |
| UT-B044 | UC-B | Server · validation › UC-B deleteIncidentSchema and restoreIncidentSchema | Negative | a restore needs its time and a client id, and nothing else | Behaved as expected | Pass |
| UT-B045 | UC-B | Server · service › edit lock rules (getEditLockReason) | Negative | a report under investigation or resolved is always locked | Behaved as expected | Pass |
| UT-B046 | UC-B | Server · service › edit lock rules (getEditLockReason) | Positive | a report on a ACTIVE patrol is editable | Behaved as expected | Pass |
| UT-B047 | UC-B | Server · service › edit lock rules (getEditLockReason) | Positive | a report on a PAUSED patrol is editable | Behaved as expected | Pass |
| UT-B048 | UC-B | Server · service › edit lock rules (getEditLockReason) | Edge | a report on an ended patrol is editable only for changes made before it ended | Behaved as expected | Pass |
| UT-B049 | UC-B | Server · service › edit lock rules (getEditLockReason) | Edge | a standalone report is editable for exactly 24 hours | Behaved as expected | Pass |
| UT-B050 | UC-B | Server · service › create incident | Positive | stores a GPS report with the ranger, type, description, location, photos and default statuses | Behaved as expected | Pass |
| UT-B051 | UC-B | Server · service › create incident | Positive | stores a manually pinned location as MANUAL | Behaved as expected | Pass |
| UT-B052 | UC-B | Server · service › create incident | Positive | keeps the "Other" threat name only for OTHER reports | Behaved as expected | Pass |
| UT-B053 | UC-B | Server · service › create incident | Positive | an offline report keeps the device report time | Behaved as expected | Pass |
| UT-B054 | UC-B | Server · service › create incident | Edge | a report time up to 5 minutes ahead (clock skew) is accepted; later is rejected | Behaved as expected | Pass |
| UT-B055 | UC-B | Server · service › create incident | Positive | stores a place name from reverse geocoding | Behaved as expected | Pass |
| UT-B056 | UC-B | Server · service › create incident | Edge | stores no named place from reverse geocoding | Behaved as expected | Pass |
| UT-B057 | UC-B | Server · service › create incident | Positive | links the patrol the ranger named and takes the park from its route | Behaved as expected | Pass |
| UT-B058 | UC-B | Server · service › create incident | Positive | a report made during a running patrol is linked to it automatically | Behaved as expected | Pass |
| UT-B059 | UC-B | Server · service › create incident | Negative | rejects attaching another ranger's patrol | Behaved as expected | Pass |
| UT-B060 | UC-B | Server · service › create incident | Negative | rejects a report dated before its patrol started | Behaved as expected | Pass |
| UT-B061 | UC-B | Server · service › create incident | Negative | rejects a park that conflicts with the patrol or does not exist | Behaved as expected | Pass |
| UT-B062 | UC-B | Server · service › create incident | Edge | a retried offline sync returns the existing report instead of a duplicate, even if withdrawn | Behaved as expected | Pass |
| UT-B063 | UC-B | Server · service › create incident | Error | propagates a database failure while saving | Behaved as expected | Pass |
| UT-B064 | UC-B | Server · service › create incident | Error | a failed patrol lookup stops the report from being saved | Behaved as expected | Pass |
| UT-B065 | UC-B | Server · service › read incidents | Positive | lists the ranger's active reports newest first with edit permissions | Behaved as expected | Pass |
| UT-B066 | UC-B | Server · service › read incidents | Negative | returns one report and rejects missing, foreign and withdrawn reports | Behaved as expected | Pass |
| UT-B067 | UC-B | Server · service › edit incident | Positive | saves a changed description atomically with an audit revision | Behaved as expected | Pass |
| UT-B068 | UC-B | Server · service › edit incident | Positive | a corrected location is stored as given, with the edit time and a fresh place name | Behaved as expected | Pass |
| UT-B069 | UC-B | Server · service › edit incident | Negative | changing to OTHER requires a threat name, and leaving OTHER clears it | Behaved as expected | Pass |
| UT-B070 | UC-B | Server · service › edit incident | Positive | replaces photos: removed ones are soft-deleted and new ones added | Behaved as expected | Pass |
| UT-B071 | UC-B | Server · service › edit incident | Negative | rejects removing the last photo | Behaved as expected | Pass |
| UT-B072 | UC-B | Server · service › edit incident | Negative | rejects removing another report's photo | Behaved as expected | Pass |
| UT-B073 | UC-B | Server · service › edit incident | Negative | rejects sending the same values | Behaved as expected | Pass |
| UT-B074 | UC-B | Server · service › edit incident | Negative | rejects more than five photos in total | Behaved as expected | Pass |
| UT-B075 | UC-B | Server · service › edit incident | Negative | rejects missing, foreign and withdrawn reports | Behaved as expected | Pass |
| UT-B076 | UC-B | Server · service › edit incident | Negative | a stale version is rejected with the current version for the client | Behaved as expected | Pass |
| UT-B077 | UC-B | Server · service › edit incident | Negative | a change saved by another device during the write is reported as a conflict | Behaved as expected | Pass |
| UT-B078 | UC-B | Server · service › edit incident | Edge | a retried edit is applied only once | Behaved as expected | Pass |
| UT-B079 | UC-B | Server · service › edit incident | Edge | two identical retries racing: the unique-constraint loser returns the saved report | Behaved as expected | Pass |
| UT-B080 | UC-B | Server · service › edit incident | Error | propagates any other database failure during the write | Behaved as expected | Pass |
| UT-B081 | UC-B | Server · service › edit incident | Negative | rejects an edit time in the future | Behaved as expected | Pass |
| UT-B082 | UC-B | Server · service › edit incident | Negative | rejects an edit time before the report existed | Behaved as expected | Pass |
| UT-B083 | UC-B | Server · service › edit incident | Edge | a standalone report can be edited at exactly 24 hours but not after | Behaved as expected | Pass |
| UT-B084 | UC-B | Server · service › edit incident | Negative | a report under investigation cannot be edited | Behaved as expected | Pass |
| UT-B085 | UC-B | Server · service › edit incident | Edge | an offline edit made before the patrol ended is accepted when it syncs later | Behaved as expected | Pass |
| UT-B086 | UC-B | Server · service › edit incident › location rules for a patrol-linked report | Positive | a location within 5 km of the patrol track is accepted | Behaved as expected | Pass |
| UT-B087 | UC-B | Server · service › edit incident › location rules for a patrol-linked report | Negative | a location more than 5 km from the patrol track is rejected with the distance | Behaved as expected | Pass |
| UT-B088 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Positive | links the report to the ranger's open patrol | Behaved as expected | Pass |
| UT-B089 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Negative | rejects linking an already linked report | Behaved as expected | Pass |
| UT-B090 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Negative | rejects linking an unknown patrol | Behaved as expected | Pass |
| UT-B091 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Negative | rejects linking another ranger's patrol | Behaved as expected | Pass |
| UT-B092 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Negative | rejects linking a completed patrol | Behaved as expected | Pass |
| UT-B093 | UC-B | Server · service › edit incident › linking a standalone report to a patrol | Negative | rejects linking a patrol started after the report | Behaved as expected | Pass |
| UT-B094 | UC-B | Server · service › withdraw (delete) and restore | Positive | withdraws a report with its reason and records a DELETE revision | Behaved as expected | Pass |
| UT-B095 | UC-B | Server · service › withdraw (delete) and restore | Edge | a withdrawal without a note stores no note | Behaved as expected | Pass |
| UT-B096 | UC-B | Server · service › withdraw (delete) and restore | Edge | a retried withdrawal returns the current report without writing again | Behaved as expected | Pass |
| UT-B097 | UC-B | Server · service › withdraw (delete) and restore | Negative | a second, different withdrawal of the same report is rejected as gone | Behaved as expected | Pass |
| UT-B098 | UC-B | Server · service › withdraw (delete) and restore | Negative | rejects withdrawing a missing report | Behaved as expected | Pass |
| UT-B099 | UC-B | Server · service › withdraw (delete) and restore | Negative | rejects withdrawing another ranger's report | Behaved as expected | Pass |
| UT-B100 | UC-B | Server · service › withdraw (delete) and restore | Negative | rejects withdrawing a stale version | Behaved as expected | Pass |
| UT-B101 | UC-B | Server · service › withdraw (delete) and restore | Negative | rejects withdrawing a locked report | Behaved as expected | Pass |
| UT-B102 | UC-B | Server · service › withdraw (delete) and restore | Negative | rejects withdrawing a delete time in the future | Behaved as expected | Pass |
| UT-B103 | UC-B | Server · service › withdraw (delete) and restore | Negative | a report changed during the withdrawal is a conflict; a racing retry is accepted | Behaved as expected | Pass |
| UT-B104 | UC-B | Server · service › withdraw (delete) and restore | Error | propagates a database failure during the withdrawal | Behaved as expected | Pass |
| UT-B105 | UC-B | Server · service › withdraw (delete) and restore | Positive | restores a withdrawn report and records what the withdrawal was | Behaved as expected | Pass |
| UT-B106 | UC-B | Server · service › withdraw (delete) and restore | Negative | restoring a report that is not withdrawn is rejected | Behaved as expected | Pass |
| UT-B107 | UC-B | Server · service › withdraw (delete) and restore | Negative | a withdrawn report can no longer be restored once its edit window has passed | Behaved as expected | Pass |
| UT-B108 | UC-B | Server · service › withdraw (delete) and restore | Edge | a retried restore returns the report without writing again | Behaved as expected | Pass |
| UT-B109 | UC-B | Server · service › withdraw (delete) and restore | Error | a restore that loses a race is a conflict; a database failure propagates | Behaved as expected | Pass |
| UT-B110 | UC-B | Server · HTTP routes | Positive | POST /api/incidents reports an incident with 201 for the identified ranger | Behaved as expected | Pass |
| UT-B111 | UC-B | Server · HTTP routes | Edge | requests without ranger headers use the demo ranger | Behaved as expected | Pass |
| UT-B112 | UC-B | Server · HTTP routes | Negative | POST /api/incidents returns every validation problem with 400 and never reaches the service | Behaved as expected | Pass |
| UT-B113 | UC-B | Server · HTTP routes | Negative | a malformed JSON body is a 400 that does not echo the request | Behaved as expected | Pass |
| UT-B114 | UC-B | Server · HTTP routes | Negative | a request body over 8 MB is rejected with 413 PAYLOAD_TOO_LARGE | Behaved as expected | Pass |
| UT-B115 | UC-B | Server · HTTP routes | Positive | GET /api/incidents/:id returns the report for the ranger | Behaved as expected | Pass |
| UT-B116 | UC-B | Server · HTTP routes | Positive | PATCH /api/incidents/:id forwards a validated edit | Behaved as expected | Pass |
| UT-B117 | UC-B | Server · HTTP routes | Negative | PATCH rejects an edit of a non-editable field with 400 | Behaved as expected | Pass |
| UT-B118 | UC-B | Server · HTTP routes | Positive | DELETE /api/incidents/:id withdraws the report with the request body | Behaved as expected | Pass |
| UT-B119 | UC-B | Server · HTTP routes | Negative | DELETE without a reason is rejected with 400 | Behaved as expected | Pass |
| UT-B120 | UC-B | Server · HTTP routes | Positive | POST /api/incidents/:id/restore undoes a withdrawal | Behaved as expected | Pass |
| UT-B121 | UC-B | Server · HTTP routes | Negative | a service AppError 404 INCIDENT_NOT_FOUND is returned with its code and details | Behaved as expected | Pass |
| UT-B122 | UC-B | Server · HTTP routes | Negative | a service AppError 403 FORBIDDEN is returned with its code and details | Behaved as expected | Pass |
| UT-B123 | UC-B | Server · HTTP routes | Negative | a service AppError 409 EDIT_CONFLICT is returned with its code and details | Behaved as expected | Pass |
| UT-B124 | UC-B | Server · HTTP routes | Negative | a service AppError 409 INCIDENT_LOCKED is returned with its code and details | Behaved as expected | Pass |
| UT-B125 | UC-B | Server · HTTP routes | Negative | a service AppError 410 INCIDENT_DELETED is returned with its code and details | Behaved as expected | Pass |
| UT-B126 | UC-B | Server · HTTP routes | Error | post /api/incidents turns an unexpected failure into a 500 error response | Behaved as expected | Pass |
| UT-B127 | UC-B | Server · HTTP routes | Error | get /api/incidents/my turns an unexpected failure into a 500 error response | Behaved as expected | Pass |
| UT-B128 | UC-B | Server · HTTP routes | Error | get /api/incidents/inc-1 turns an unexpected failure into a 500 error response | Behaved as expected | Pass |
| UT-B129 | UC-B | Server · HTTP routes | Error | delete /api/incidents/inc-1 turns an unexpected failure into a 500 error response | Behaved as expected | Pass |
| UT-B130 | UC-B | Server · HTTP routes | Error | post /api/incidents/inc-1/restore turns an unexpected failure into a 500 error response | Behaved as expected | Pass |
| UT-B131 | UC-B | Server · place names | Positive | a new report waits at most 3 seconds for its place name | Behaved as expected | Pass |
| UT-B132 | UC-B | Server · place names | Edge | only a location never looked up needs a place name (null means "no named place") | Behaved as expected | Pass |
| UT-B133 | UC-B | Server · place names | Positive | fills in names for reports that lack one, and saves only for unchanged coordinates | Behaved as expected | Pass |
| UT-B134 | UC-B | Server · place names | Error | a failed save is logged and the remaining reports are still processed | Behaved as expected | Pass |
| UT-B135 | UC-B | Server · place names | Edge | does nothing while reverse geocoding is disabled | Behaved as expected | Pass |
| UT-B136 | UC-B | Server · place names | Error | pauses for 5 minutes when the lookup service is unavailable, then resumes | Behaved as expected | Pass |
| UT-B137 | UC-B | Server · geocoder (existing) › formatPlaceName | Positive | uses the most specific named place and the country | Behaved as expected | Pass |
| UT-B138 | UC-B | Server · geocoder (existing) › formatPlaceName | Edge | falls back to the region, and returns null when there is nothing named | Behaved as expected | Pass |
| UT-B139 | UC-B | Server · geocoder (existing) › ReverseGeocoder | Positive | calls Nominatim reverse with an identifying User-Agent and caches the answer | Behaved as expected | Pass |
| UT-B140 | UC-B | Server · geocoder (existing) › ReverseGeocoder | Error | null when there is no named place; undefined when the service fails or is disabled | Behaved as expected | Pass |
| UT-B141 | UC-B | Server · geocoder (existing) › ReverseGeocoder | Edge | waits between requests (Nominatim allows 1 per second) | Behaved as expected | Pass |
| UT-B142 | UC-B | Server · geocoder (existing) › ReverseGeocoder | Edge | gives up when the wait would exceed the timeout | Behaved as expected | Pass |
| UT-B143 | UC-B | Client · incidentApi › online reporting | Positive | createIncident posts the report with a client id, lets the server set the time and caches it as SYNCED | Behaved as expected | Pass |
| UT-B144 | UC-B | Client · incidentApi › online reporting | Edge | a draft keeps its client id, so retries are recognised by the server | Behaved as expected | Pass |
| UT-B145 | UC-B | Client · incidentApi › online reporting | Negative | a server rejection (400 VALIDATION_ERROR) is shown to the ranger and nothing is saved offline | Behaved as expected | Pass |
| UT-B146 | UC-B | Client · incidentApi › online reporting | Negative | a server rejection (403 FORBIDDEN) is shown to the ranger and nothing is saved offline | Behaved as expected | Pass |
| UT-B147 | UC-B | Client · incidentApi › online reporting | Negative | a server rejection (409 EDIT_CONFLICT) is shown to the ranger and nothing is saved offline | Behaved as expected | Pass |
| UT-B148 | UC-B | Client · incidentApi › online reporting | Negative | a server rejection (413 PAYLOAD_TOO_LARGE) is shown to the ranger and nothing is saved offline | Behaved as expected | Pass |
| UT-B149 | UC-B | Client · incidentApi › online reporting | Error | a server rejection (500 without an error code) is shown to the ranger and nothing is saved offline | Behaved as expected | Pass |
| UT-B150 | UC-B | Client · incidentApi › online reporting | Positive | getIncidentById returns the server report | Behaved as expected | Pass |
| UT-B151 | UC-B | Client · incidentApi › online reporting | Negative | getIncidentById reports the server's 404 instead of showing a stale device copy | Behaved as expected | Pass |
| UT-B152 | UC-B | Client · incidentApi › online reporting | Positive | updateIncident sends the changes and refreshes the device copy | Behaved as expected | Pass |
| UT-B153 | UC-B | Client · incidentApi › online reporting | Negative | an edit conflict keeps the server code and details | Behaved as expected | Pass |
| UT-B154 | UC-B | Client · incidentApi › online reporting | Positive | deleteIncident withdraws with the reason in the request body | Behaved as expected | Pass |
| UT-B155 | UC-B | Client · incidentApi › online reporting | Negative | a withdrawal rejected as already deleted keeps the 410 code | Behaved as expected | Pass |
| UT-B156 | UC-B | Client · incidentApi › online reporting | Positive | restoreIncident posts a fresh undo with its time | Behaved as expected | Pass |
| UT-B157 | UC-B | Client · incidentApi › without a connection | Positive | a GPS report is saved on the device as PENDING (not SYNCED) and queued for upload | Behaved as expected | Pass |
| UT-B158 | UC-B | Client · incidentApi › without a connection | Positive | a manually pinned location, park and photo defaults are kept on the device | Behaved as expected | Pass |
| UT-B159 | UC-B | Client · incidentApi › without a connection | Error | a device storage failure is reported instead of losing the report silently | Behaved as expected | Pass |
| UT-B160 | UC-B | Client · incidentApi › without a connection | Positive | getIncidentById serves the device copy with its sync status | Behaved as expected | Pass |
| UT-B161 | UC-B | Client · incidentApi › without a connection | Error | updateIncident needs a connection and says so | Behaved as expected | Pass |
| UT-B162 | UC-B | Client · incidentApi › without a connection | Error | deleteIncident needs a connection and says so | Behaved as expected | Pass |
| UT-B163 | UC-B | Client · incidentApi › without a connection | Error | restoreIncident needs a connection and says so | Behaved as expected | Pass |
| UT-B164 | UC-B | Client · incidentApi › the report list (getMyIncidents) | Positive | online: merges the server list with unsynced drafts, newest first, and flushes the queue first | Behaved as expected | Pass |
| UT-B165 | UC-B | Client · incidentApi › the report list (getMyIncidents) | Edge | online: a synced copy the server no longer lists (e.g. withdrawn elsewhere) is removed from the device | Behaved as expected | Pass |
| UT-B166 | UC-B | Client · incidentApi › the report list (getMyIncidents) | Positive | offline: shows the device copies with their sync status and hides withdrawn ones | Behaved as expected | Pass |
| UT-B167 | UC-B | Client · incidentApi › the report list (getMyIncidents) | Edge | opening the list never deletes unsynced reports, even with identical descriptions | Behaved as expected | Pass |
| UT-B168 | UC-B | Client · incidentApi › the report list (getMyIncidents) | Edge | repeated synced demo copies are still tidied to the newest one | Behaved as expected | Pass |
| UT-B169 | UC-B | Client · incidentApi › synchronising offline reports | Positive | syncIncidentPayload uploads the original report time, location source, patrol, park and photos, then marks it SYNCED | Behaved as expected | Pass |
| UT-B170 | UC-B | Client · incidentApi › synchronising offline reports | Error | a failed upload marks the device copy FAILED but keeps the whole report | Behaved as expected | Pass |
| UT-B171 | UC-B | Client · incidentApi › synchronising offline reports | Positive | PENDING -> reconnect -> server accepts -> SYNCED on the device and in the queue | Behaved as expected | Pass |
| UT-B172 | UC-B | Client · incidentApi › synchronising offline reports | Error | a lost connection during upload keeps the report and leaves it queued for an automatic retry | Behaved as expected | Pass |
| UT-B173 | UC-B | Client · incidentApi › synchronising offline reports | Error | a server rejection during upload marks the queue item FAILED and keeps the report | Behaved as expected | Pass |
| UT-B174 | UC-B | Client · incidentApi › synchronising offline reports | Error | Retry Sync: a failed retry records the error, and the next retry succeeds | Behaved as expected | Pass |
| UT-B175 | UC-B | Client · incidentApi › synchronising offline reports | Negative | Retry Sync fails clearly when the report is not on the device | Behaved as expected | Pass |
| UT-B176 | UC-B | Client · incidentApi › discarding an unsynced draft | Positive | removes the draft and its queued upload from the device | Behaved as expected | Pass |
| UT-B177 | UC-B | Client · incidentApi › discarding an unsynced draft | Negative | refuses a report that already synced, and one that is uploading right now | Behaved as expected | Pass |
| UT-B178 | UC-B | Client · incidentApi › discarding an unsynced draft | Edge | an unknown draft is ignored | Behaved as expected | Pass |
| UT-B179 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Positive | reads a image/jpeg photo as a data URL | Behaved as expected | Pass |
| UT-B180 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Positive | reads a image/png photo as a data URL | Behaved as expected | Pass |
| UT-B181 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Positive | reads a image/webp photo as a data URL | Behaved as expected | Pass |
| UT-B182 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Negative | rejects a GIF file | Behaved as expected | Pass |
| UT-B183 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Negative | rejects a HEIC file | Behaved as expected | Pass |
| UT-B184 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Negative | rejects a PDF file | Behaved as expected | Pass |
| UT-B185 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Negative | rejects an untyped file | Behaved as expected | Pass |
| UT-B186 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Edge | accepts exactly 5 MB and rejects a larger photo | Behaved as expected | Pass |
| UT-B187 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Error | reports a friendly error when the camera/file read fails | Behaved as expected | Pass |
| UT-B188 | UC-B | Client · utilities › photo evidence files (readEvidenceFile) | Error | reports a friendly error when the read produces no image data | Behaved as expected | Pass |
| UT-B189 | UC-B | Client · utilities › report form schema | Positive | accepts a complete report and defaults the location source to GPS | Behaved as expected | Pass |
| UT-B190 | UC-B | Client · utilities › report form schema | Edge | accepts boundary coordinates and a manual location | Behaved as expected | Pass |
| UT-B191 | UC-B | Client · utilities › report form schema | Negative | rejects a missing incident type | Behaved as expected | Pass |
| UT-B192 | UC-B | Client · utilities › report form schema | Negative | rejects a blank description | Behaved as expected | Pass |
| UT-B193 | UC-B | Client · utilities › report form schema | Negative | rejects a 1001-character description | Behaved as expected | Pass |
| UT-B194 | UC-B | Client · utilities › report form schema | Negative | rejects latitude 91 | Behaved as expected | Pass |
| UT-B195 | UC-B | Client · utilities › report form schema | Negative | rejects longitude -180.5 | Behaved as expected | Pass |
| UT-B196 | UC-B | Client · utilities › report form schema | Negative | rejects a missing photo | Behaved as expected | Pass |
| UT-B197 | UC-B | Client · utilities › report form schema | Negative | rejects an "Other" threat named with 2 characters | Behaved as expected | Pass |
| UT-B198 | UC-B | Client · utilities › report form schema | Negative | rejects a 201-character "Other" name | Behaved as expected | Pass |
| UT-B199 | UC-B | Client · utilities › report form schema | Edge | a 1000-character description is accepted | Behaved as expected | Pass |
| UT-B200 | UC-B | Client · utilities › incident types | Positive | labels each type for the ranger and falls back to the raw value | Behaved as expected | Pass |
| UT-B201 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | location problem is titled "Location not set" | Behaved as expected | Pass |
| UT-B202 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | incidentType problem is titled "Incident type not selected" | Behaved as expected | Pass |
| UT-B203 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | imageUrl problem is titled "Photo evidence missing" | Behaved as expected | Pass |
| UT-B204 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | description problem is titled "Description is empty" | Behaved as expected | Pass |
| UT-B205 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | description problem is titled "Description too short" | Behaved as expected | Pass |
| UT-B206 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | description problem is titled "Description too long" | Behaved as expected | Pass |
| UT-B207 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | otherTypeDescription problem is titled "Describe the "Other" threat" | Behaved as expected | Pass |
| UT-B208 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | otherTypeDescription problem is titled "Threat details too long" | Behaved as expected | Pass |
| UT-B209 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Positive | lists problems in the order the fields appear on the form | Behaved as expected | Pass |
| UT-B210 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | 0 photos is a problem: "At least one photo must remain" | Behaved as expected | Pass |
| UT-B211 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | 6 photos is a problem: "Too many photos" | Behaved as expected | Pass |
| UT-B212 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Negative | 7 photos is a problem: "Too many photos" | Behaved as expected | Pass |
| UT-B213 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Edge | 1 to 5 photos is fine, and the message says how many to remove | Behaved as expected | Pass |
| UT-B214 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code OFFLINE on save is explained as "You're offline" | Behaved as expected | Pass |
| UT-B215 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code INCIDENT_LOCKED on save is explained as "This report is locked" | Behaved as expected | Pass |
| UT-B216 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code EDIT_CONFLICT on save is explained as "Changed on another device" | Behaved as expected | Pass |
| UT-B217 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code INCIDENT_DELETED on delete is explained as "Report already deleted" | Behaved as expected | Pass |
| UT-B218 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code INCIDENT_NOT_DELETED on restore is explained as "Report is not deleted" | Behaved as expected | Pass |
| UT-B219 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code SYNC_IN_PROGRESS on delete is explained as "Report is syncing" | Behaved as expected | Pass |
| UT-B220 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code ALREADY_SYNCED on delete is explained as "Report is syncing" | Behaved as expected | Pass |
| UT-B221 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code OTHER_DESCRIPTION_REQUIRED on save is explained as "Describe the "Other" threat" | Behaved as expected | Pass |
| UT-B222 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code EVIDENCE_REQUIRED on save is explained as "At least one photo must remain" | Behaved as expected | Pass |
| UT-B223 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code TOO_MANY_EVIDENCE on save is explained as "Too many photos" | Behaved as expected | Pass |
| UT-B224 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code EVIDENCE_NOT_FOUND on save is explained as "Photo no longer available" | Behaved as expected | Pass |
| UT-B225 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code LOCATION_TOO_FAR_FROM_PATROL on save is explained as "Location too far from your patrol" | Behaved as expected | Pass |
| UT-B226 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code NO_CHANGES on save is explained as "No changes to save" | Behaved as expected | Pass |
| UT-B227 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code INVALID_EDIT_TIME on save is explained as "Check your device clock" | Behaved as expected | Pass |
| UT-B228 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code FORBIDDEN on submit is explained as "Not allowed" | Behaved as expected | Pass |
| UT-B229 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code INCIDENT_NOT_FOUND on save is explained as "Report not found" | Behaved as expected | Pass |
| UT-B230 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code PAYLOAD_TOO_LARGE on submit is explained as "Photo is too large to upload" | Behaved as expected | Pass |
| UT-B231 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | server code VALIDATION_ERROR on submit is explained as "Some details were not accepted" | Behaved as expected | Pass |
| UT-B232 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | an edit conflict while deleting asks the ranger to review before deleting | Behaved as expected | Pass |
| UT-B233 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a plain error "Error: Request body exceeds the 8 MB limit." on submit is explained as "Photo is too large to upload" | Behaved as expected | Pass |
| UT-B234 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a plain error "Error: Unauthorized: not your report" on save is explained as "Not allowed" | Behaved as expected | Pass |
| UT-B235 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a plain error "Error: Unable to save this incident on the device. Please try again." on submit is explained as "Could not save on this device" | Behaved as expected | Pass |
| UT-B236 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a plain error "Error: Something unexpected" on submit is explained as "The server rejected this report" | Behaved as expected | Pass |
| UT-B237 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a plain error "Error: Something unexpected" on restore is explained as "The server could not restore this report" | Behaved as expected | Pass |
| UT-B238 | UC-B | Client · utilities › form problem wording (incidentFormIssues) | Error | a non-Error failure uses the fallback message for the action | Behaved as expected | Pass |
| UT-B239 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | starts the edit form from the saved report with nothing changed | Behaved as expected | Pass |
| UT-B240 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | measures how far a pin moved and formats it | Behaved as expected | Pass |
| UT-B241 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | counts photos kept after removals plus new photos | Behaved as expected | Pass |
| UT-B242 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | builds only the changed fields with a readable summary | Behaved as expected | Pass |
| UT-B243 | UC-B | Client · utilities › edit helpers (incidentEdit) | Edge | long new text is shortened in the summary but sent in full | Behaved as expected | Pass |
| UT-B244 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | a delete request carries the edited version and a note only when given | Behaved as expected | Pass |
| UT-B245 | UC-B | Client · utilities › edit helpers (incidentEdit) | Positive | names a report by its threat name for OTHER, otherwise by its type | Behaved as expected | Pass |
| UT-B246 | UC-B | Client · utilities › edit helpers (incidentEdit) | Negative | flags an over-long description or threat name and too many photos | Behaved as expected | Pass |
| UT-B247 | UC-B | Client · components › EvidenceEditor | Positive | counts kept and new photos, and lets the ranger mark a saved photo for removal | Behaved as expected | Pass |
| UT-B248 | UC-B | Client · components › EvidenceEditor | Positive | a photo marked for removal is labelled and can be restored | Behaved as expected | Pass |
| UT-B249 | UC-B | Client · components › EvidenceEditor | Positive | a new photo can be discarded before saving | Behaved as expected | Pass |
| UT-B250 | UC-B | Client · components › EvidenceEditor | Positive | adds a valid photo chosen from the camera or files | Behaved as expected | Pass |
| UT-B251 | UC-B | Client · components › EvidenceEditor | Negative | explains why an unsupported file was not added | Behaved as expected | Pass |
| UT-B252 | UC-B | Client · components › EvidenceEditor | Edge | offers Add Photo only while fewer than 5 photos remain, and shows a form error | Behaved as expected | Pass |
| UT-B253 | UC-B | Client · components › PhotoCapture | Negative | rejects an unsupported file with a message and keeps the capture button | Behaved as expected | Pass |
| UT-B254 | UC-B | Client · components › DeleteIncidentDialog | Positive | shows which report is affected, including its place and patrol | Behaved as expected | Pass |
| UT-B255 | UC-B | Client · components › DeleteIncidentDialog | Negative | "Other" needs a short note before the report is deleted | Behaved as expected | Pass |
| UT-B256 | UC-B | Client · components › DeleteIncidentDialog | Edge | Escape keeps the report unless a delete is already in progress | Behaved as expected | Pass |
| UT-B257 | UC-B | Client · components › DeleteIncidentDialog | Positive | discarding an unsynced draft needs no reason and warns it cannot be recovered | Behaved as expected | Pass |
| UT-B258 | UC-B | Client · components › UndoToast | Edge | dismisses itself after 10 seconds | Behaved as expected | Pass |
| UT-B259 | UC-B | Client · components › UndoToast | Positive | Undo restores the report and does not expire while restoring | Behaved as expected | Pass |
| UT-B260 | UC-B | Client · components › UndoToast | Positive | the close button dismisses it immediately | Behaved as expected | Pass |
| UT-B261 | UC-B | Client · pages › ReportIncidentPage | Positive | the GPS fix is shown and submitted as a GPS location; a synced report is confirmed | Behaved as expected | Pass |
| UT-B262 | UC-B | Client · pages › ReportIncidentPage | Error | when GPS permission is denied the ranger pins the location manually and it is submitted as MANUAL | Behaved as expected | Pass |
| UT-B263 | UC-B | Client · pages › ReportIncidentPage | Positive | a GPS location can be overridden with a manually pinned spot | Behaved as expected | Pass |
| UT-B264 | UC-B | Client · pages › ReportIncidentPage | Positive | a report saved on the device is confirmed as pending synchronisation, not as synced | Behaved as expected | Pass |
| UT-B265 | UC-B | Client · pages › ReportIncidentPage | Positive | a report started from a patrol is linked to it, skips the park choice and returns to the patrol | Behaved as expected | Pass |
| UT-B266 | UC-B | Client · pages › ReportIncidentPage | Positive | a standalone report carries the chosen park, and the ranger can go to the report list | Behaved as expected | Pass |
| UT-B267 | UC-B | Client · pages › ReportIncidentPage | Error | a device storage failure is explained and nothing is confirmed | Behaved as expected | Pass |
| UT-B268 | UC-B | Client · pages › IncidentHistoryPage | Positive | lists reports with their synced, pending and failed states and Retry only for unsynced ones | Behaved as expected | Pass |
| UT-B269 | UC-B | Client · pages › IncidentHistoryPage | Positive | Retry Sync uploads the report and reloads the list | Behaved as expected | Pass |
| UT-B270 | UC-B | Client · pages › IncidentHistoryPage | Error | a failed Retry Sync explains the problem and keeps the report listed | Behaved as expected | Pass |
| UT-B271 | UC-B | Client · pages › IncidentHistoryPage | Negative | a locked report shows why instead of Edit and Delete | Behaved as expected | Pass |
| UT-B272 | UC-B | Client · pages › IncidentHistoryPage | Edge | an empty list, or one that could not be loaded, shows the empty state | Behaved as expected | Pass |
| UT-B273 | UC-B | Client · pages › IncidentHistoryPage | Positive | Edit Report and Report New Incident open their pages | Behaved as expected | Pass |
| UT-B274 | UC-B | Client · pages › IncidentHistoryPage | Positive | Undo offered after deleting from the edit page restores the report | Behaved as expected | Pass |
| UT-B275 | UC-B | Client · pages › IncidentHistoryPage | Error | an Undo refused by the server explains it and offers to reload the list | Behaved as expected | Pass |
| UT-B276 | UC-B | Client · pages › EditIncidentPage | Error | a report that cannot be loaded cannot be edited and offers a way back | Behaved as expected | Pass |
| UT-B277 | UC-B | Client · pages › EditIncidentPage | Negative | a report that is only saved on the device cannot be edited and offers a way back | Behaved as expected | Pass |
| UT-B278 | UC-B | Client · pages › EditIncidentPage | Negative | a report that was withdrawn cannot be edited and offers a way back | Behaved as expected | Pass |
| UT-B279 | UC-B | Client · pages › EditIncidentPage | Negative | a report that is locked cannot be edited and offers a way back | Behaved as expected | Pass |
| UT-B280 | UC-B | Client · pages › EditIncidentPage | Positive | a standalone report shows its 24-hour edit deadline | Behaved as expected | Pass |
| UT-B281 | UC-B | Client · pages › EditIncidentPage | Positive | a corrected location and replaced photo are saved as MANUAL location and photo changes | Behaved as expected | Pass |
| UT-B282 | UC-B | Client · pages › EditIncidentPage | Edge | a moved pin can be undone before saving | Behaved as expected | Pass |
| UT-B283 | UC-B | Client · pages › EditIncidentPage | Negative | an emptied description is caught before anything is sent | Behaved as expected | Pass |
| UT-B284 | UC-B | Client · pages › EditIncidentPage | Error | saving without a connection explains it and keeps the edits on screen | Behaved as expected | Pass |
| UT-B285 | UC-B | Client · pages › EditIncidentPage | Positive | Edit Again returns to the form starting from the saved version | Behaved as expected | Pass |
| UT-B286 | UC-B | Client · pages › EditIncidentPage | Error | a delete refused because of a newer version offers to load it | Behaved as expected | Pass |
| UT-B287 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | ReportIncidentPage renders location status and incident type options | Behaved as expected | Pass |
| UT-B288 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | PhotoCapture component handles image preview and retake actions | Behaved as expected | Pass |
| UT-B289 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Negative | ReportIncidentPage shows every missing field in a validation popup before review | Behaved as expected | Pass |
| UT-B290 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Negative | validation popup distinguishes a too-short description and "Take Me There" for location opens the map picker | Behaved as expected | Pass |
| UT-B291 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Error | server rejection at submit is shown in a popup above the review screen | Behaved as expected | Pass |
| UT-B292 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | ReportIncidentPage "Report Another Incident" resets the form and uses a new client ID | Behaved as expected | Pass |
| UT-B293 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | incidentApi.createIncident submits incident payload online | Behaved as expected | Pass |
| UT-B294 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | incidentApi.createIncident handles offline network failure with PENDING sync status | Behaved as expected | Pass |
| UT-B295 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Negative | incidentApi.createIncident surfaces server errors instead of saving them as pending | Behaved as expected | Pass |
| UT-B296 | UC-B | Client · reporting (existing) › UC-B Conservation Incident Reporting Frontend Tests | Positive | incidentApi.syncIncidentPayload syncs offline payload and updates remote incident | Behaved as expected | Pass |
| UT-B297 | UC-B | Client · editing (existing) › Incident edit helpers | Edge | buildIncidentChanges returns nothing when the form is unchanged | Behaved as expected | Pass |
| UT-B298 | UC-B | Client · editing (existing) › Incident edit helpers | Positive | buildIncidentChanges sends only changed fields and trims text | Behaved as expected | Pass |
| UT-B299 | UC-B | Client · editing (existing) › Incident edit helpers | Negative | validateEditForm requires an "Other" name and at least one photo | Behaved as expected | Pass |
| UT-B300 | UC-B | Client · editing (existing) › EditIncidentPage | Positive | prefills the report and saves only the changed description | Behaved as expected | Pass |
| UT-B301 | UC-B | Client · editing (existing) › EditIncidentPage | Edge | shows a "no changes" popup when nothing was edited | Behaved as expected | Pass |
| UT-B302 | UC-B | Client · editing (existing) › EditIncidentPage | Negative | blocks removing the last photo | Behaved as expected | Pass |
| UT-B303 | UC-B | Client · editing (existing) › EditIncidentPage | Negative | shows a lock screen when the patrol has been completed | Behaved as expected | Pass |
| UT-B304 | UC-B | Client · editing (existing) › EditIncidentPage | Negative | on an edit conflict, "Keep My Changes" re-applies the edit on top of the latest version | Behaved as expected | Pass |
| UT-B305 | UC-B | Client · editing (existing) › EditIncidentPage | Negative | "See Latest" discards local changes and loads the newer version | Behaved as expected | Pass |
| UT-B306 | UC-B | Client · editing (existing) › EditIncidentPage | Negative | a server lock while saving explains why and offers a way back | Behaved as expected | Pass |
| UT-B307 | UC-B | Client · editing (existing) › IncidentHistoryPage location wording | Positive | shows the place name with coordinates, and only coordinates until a name is available | Behaved as expected | Pass |
| UT-B308 | UC-B | Client · editing (existing) › IncidentHistoryPage edit controls | Positive | shows Edit only for editable reports and a lock badge otherwise | Behaved as expected | Pass |
| UT-B309 | UC-B | Client · editing (existing) › incidentApi.updateIncident | Error | sends a PATCH and maps server error codes to ApiError | Behaved as expected | Pass |
| UT-B310 | UC-B | Client · editing (existing) › incidentApi.updateIncident | Error | reports OFFLINE when there is no connection | Behaved as expected | Pass |
| UT-B311 | UC-B | Client · editing (existing) › ReportIncidentPage "Other" rule | Negative | requires a name for an "Other" threat before review | Behaved as expected | Pass |
| UT-B312 | UC-B | Client · deleting (existing) › Deleting from the history page | Positive | requires a reason, withdraws the report, and Undo restores it | Behaved as expected | Pass |
| UT-B313 | UC-B | Client · deleting (existing) › Deleting from the history page | Negative | a conflict explains what happened and offers to reload | Behaved as expected | Pass |
| UT-B314 | UC-B | Client · deleting (existing) › Deleting from the history page | Negative | locked reports have no Delete button | Behaved as expected | Pass |
| UT-B315 | UC-B | Client · deleting (existing) › Deleting from the history page | Positive | an unsynced draft is discarded from the device without a reason or Undo | Behaved as expected | Pass |
| UT-B316 | UC-B | Client · deleting (existing) › Deleting from the edit page | Positive | withdraws the report and returns to the list with an Undo offer | Behaved as expected | Pass |
| UT-B317 | UC-B | Client · deleting (existing) › Deleting from the edit page | Negative | a withdrawn report cannot be opened for editing | Behaved as expected | Pass |
| UT-B318 | UC-B | Client · deleting (existing) › incidentApi delete/restore | Positive | deleteIncident sends a DELETE with the body; restoreIncident posts a fresh restore id | Behaved as expected | Pass |
| UT-B319 | UC-B | Client · deleting (existing) › incidentApi delete/restore | Error | deleteIncident reports OFFLINE without a connection | Behaved as expected | Pass |
| UT-B320 | UC-B | Client · time and location (existing) › Offline reports keep the real report time | Edge | the time is taken when the ranger submits, not when the network attempt finally fails | Behaved as expected | Pass |
| UT-B321 | UC-B | Client · time and location (existing) › Offline reports keep the real report time | Positive | online submissions leave the time to the server clock | Behaved as expected | Pass |
| UT-B322 | UC-B | Client · time and location (existing) › Offline reports keep the real report time | Positive | syncing a queued report sends the original report time | Behaved as expected | Pass |
| UT-B323 | UC-B | Client · time and location (existing) › ManualLocationPicker input handling | Edge | parseCoordinate accepts only complete, in-range numbers | Behaved as expected | Pass |
| UT-B324 | UC-B | Client · time and location (existing) › ManualLocationPicker input handling | Negative | clearing a coordinate no longer crashes; it shows an error and blocks confirm | Behaved as expected | Pass |
| UT-B325 | UC-B | Client · time and location (existing) › ManualLocationPicker input handling | Edge | partial input such as "-" is allowed while typing, then the finished value is confirmed | Behaved as expected | Pass |

## UC-C – Manage Wildlife Conflict Alerts & Response

Results recorded on 9 October 2026 from the final code of this phase.

### Frameworks and isolation

- **Server:** Jest, ts-jest and Supertest. Prisma is replaced by `server/tests/conflictAlertPrismaMock.ts`; the conflict-alert service that decides whether a collar reading becomes an alert runs for real. Collar gateway credentials are set per test on the parsed `env` object, the clock is fixed with Jest fake timers, and risk zones are swapped for deterministic test zones where a test needs exact distances.
- **Client:** Vitest, React Testing Library and userEvent. HTTP calls are mocked, while Dexie (on `fake-indexeddb`) and the shared `SyncService` run for real, so offline field responses and their synchronisation are checked against real IndexedDB contents.
- Responder notification is a log call in this implementation; tests make it fail by mocking it. No external notification service is involved.

### Test files

| File | Layer | Tests | Notes |
|---|---|---|---|
| `server/tests/conflictAlertValidation.test.ts` | Server request validation (zod) | 41 | New |
| `server/tests/conflictAlertService.test.ts` | Server conflict-alert service: risk zones, community reports, lifecycle, notification, Prisma mocked | 87 | New |
| `server/tests/conflictAlertRoutes.test.ts` | Server HTTP controller, routes and error mapping (Supertest) | 24 | New |
| `server/tests/collarIngestion.test.ts` | Collar telemetry validation, vendor normalisation, gateway key / HMAC middleware, ingestion, device monitoring, routes, live stream | 70 | New |
| `server/tests/conflictAlertPrismaMock.ts` | Reusable Prisma mock for UC-C | – | Test helper |
| `client/src/features/conflict-alerts/api/conflictAlertApi.test.ts` | Conflict-alert API: online, server rejection vs lost connection, offline (Dexie), sync, retry | 82 | New |
| `client/src/features/conflict-alerts/pages/ConflictAlertPages.test.tsx` | Alerts list and alert detail pages | 31 | New |
| `client/src/features/conflict-alerts/components/ConflictAlertComponents.test.tsx` | Alert card, response form, history timeline, community report and collar simulator modals | 15 | New |
| `client/src/features/collars/Collars.test.tsx` | Collar API, collar monitoring page, telemetry history | 13 | New |
| `client/src/features/conflict-alerts/ConflictAlerts.test.tsx` | Existing UC-C component and offline tests | 16 | Existing, unchanged |

Total UC-C unit tests executed: **379** (222 server, 157 client), **379 passed**. Of these, 363 are new.

By type: **120 Positive, 134 Negative, 63 Edge, 62 Error.**

`server/tests/parkAssociationWorkflows.test.ts` (shared park context) also exercises some conflict-alert routes. It is counted with the existing shared tests, not with UC-C.

The database-backed tests in `server/tests/integration/conflictAlerts.integration.test.ts` and `server/tests/integration/collarIngestion.integration.test.ts` are integration tests. They were not run in this phase.

### Scenarios covered

- **Validation (direct schema tests):**
  - latitude and longitude at exactly ±90 and ±180, coordinates 0,0, values just outside the range, NaN, null, numeric strings and Infinity
  - required animal ID, device ID, event ID, community location, report type and description; the 5-character minimum community description; the 3-character minimum response and resolution notes
  - ISO-8601 collar timestamps (UTC or offset) accepted; date-only, local-format and free-text timestamps rejected
  - battery 0–100 (integers), non-negative GPS accuracy, supported alert types, severities and response actions
- **GPS collar alerts:**
  - a reading inside a configured risk zone creates an OPEN alert with source COLLAR, the animal, location and time, an audit entry and a responder notification
  - a valid reading outside every zone is stored as tracking data only; no alert is looked up, created, audited or notified
  - repeated readings are idempotent on the event ID; a duplicate delivery returns 200 instead of 202
- **Risk-zone logic (the service's own Haversine check, not a map library):**
  - clearly inside, clearly outside, 4.99 km and 5.01 km from a 5 km zone, the inclusive boundary (distance equal to the radius), overlapping zones, no zones and 0,0
  - the proximity severity bands (CRITICAL, HIGH, MEDIUM, LOW)
  - malformed zone data (NaN radius or centre), NaN reading coordinates and a zone calculation that throws never create an alert
- **Community reports:**
  - source COMMUNITY_REPORT, MANUAL location, description, reporter name ("Community Member" when absent) and severity by report type
- **Lifecycle (OPEN → ACKNOWLEDGED → RESPONDING → RESOLVED, and CANCELLED):**
  - responder, acknowledgement time, response action, notes, outcome, resolver, resolution time and notes are stored and audited
  - each forbidden transition is rejected with HTTP 409: acknowledging a non-OPEN alert, responding before acknowledgement or after resolution or cancellation, resolving before a response, resolving twice, and cancelling a terminal alert
  - resolved and cancelled alerts are read-only (403); only the original responder may edit or delete a response
  - offline retries with the same client ID never duplicate an acknowledgement, response or resolution
- **Notification failure:** the alert stays persisted and is still returned, and the failure is logged.
- **Collar gateway security:** a correct key in any supported header, a missing or wrong key, an unconfigured gateway (503), valid and invalid HMAC signatures. A rejected request never reaches the ingestion service.
- **Server error versus lost connection (client):**
  - for every alert action, a 400, 403, 409 or 500 answer is shown to the ranger with the server's message, and nothing is saved offline or queued
  - only a request with no response (network error or timeout) switches to offline mode
- **Offline field response and synchronisation (real Dexie):**
  - acknowledge, respond, resolve, edit, cancel, delete and response edits offline are saved on the device as PENDING and queued with their client IDs
  - reconnecting syncs them to the matching endpoints and the device copy becomes SYNCED
  - a lost connection during sync keeps the item queued; a server rejection marks it FAILED
  - no failed sync deletes the local alert or its responses; Retry later succeeds
- **Collar monitoring (client):**
  - device table, risk-zone state, battery and online status, search and filters, telemetry log, empty and error states
  - the simulator inside and outside a risk zone

### Coverage

Measured with Jest (server, unit suites only) and Vitest V8 (client). Folder figures are the coverage tool's per-file numbers summed over the folder.

| Area | Before: Stmts / Branch / Funcs / Lines | After: Stmts / Branch / Funcs / Lines |
|---|---|---|
| Server `src/modules/conflict-alerts` | 55.70 / 40.55 / 54.76 / 75.48 | **99.66 / 94.41 / 100 / 100** |
| Server `src/modules/collar-ingestion` | 6.61 / 0 / 0 / 6.87 | **100 / 93.28 / 100 / 100** |
| Client `src/features/conflict-alerts` | 75.42 / 60.81 / 38.89 / 75.42 | **92.53 / 87.22 / 87.04 / 92.53** |
| Client `src/features/collars` | 12.44 / 33.33 / 11.11 / 12.44 | **91.49 / 83.33 / 85.71 / 91.49** |
| Server overall | 84.25 / 74.35 / 83.96 / 87.67 | 97.46 / 90.19 / 92.94 / 97.83 |
| Client overall | 86.94 / 86.89 / 77.33 / 86.94 | 94.12 / 88.96 / 87.62 / 94.12 |

"Before" is the end of the UC-B phase. `conflict-alerts/types/conflictAlert.ts` and `collars/types/collar.ts` contain only TypeScript types and report 0%; they are still counted in the feature figures.

### Defects found and fixed

Each listed regression test was confirmed to fail against the code before the fix (15 server service tests, 1 collar-ingestion test, 45 client API tests and 2 component tests).

| # | File | Defect | Fix | Regression tests |
|---|---|---|---|---|
| 1 | `server/src/modules/conflict-alerts/service.ts` | Invalid lifecycle transitions were plain `Error`s, so the API answered **HTTP 500**. The client's sync queue treats 5xx as retryable, so an offline action the server could never accept was retried indefinitely instead of being marked FAILED. | Transitions throw `AppError(409, 'INVALID_STATE_TRANSITION')` with the same messages. | UT-C094 to UT-C097, UT-C103 to UT-C105, UT-C109 to UT-C112, UT-C119, UT-C120. UT-C142 checks the resulting HTTP 409 response. |
| 2 | `server/src/modules/conflict-alerts/service.ts` | If the responder notification failed, `createAlert` threw **after** the alert had been saved and audited. The caller was told the alert failed, collar ingestion did not mark the reading as alerted, and a retried community report could create a duplicate. | The notification is isolated with `try/catch`; the failure is logged and the saved alert is returned. | UT-C049, UT-C050 |
| 3 | `server/src/modules/collar-ingestion/service.ts` | The reading is stored before the alert step. If alert creation failed, the gateway's retry of the same event was answered "duplicate, no alert", so a genuine breach **never** produced an alert. | A stored reading that has no alert is evaluated again on retry. Alert creation is already idempotent on the event ID, so this never duplicates an alert. | UT-C200 |
| 4 | `client/src/features/conflict-alerts/api/conflictAlertApi.ts` | Acknowledge, respond, resolve, edit, cancel, delete and response edits treated **every** error, including 400, 403, 404 and 409 server answers, as being offline. The ranger saw a false "saved locally" success, and a request the server had already refused was queued. A 5xx on a collar reading or community report was also queued instead of shown. | As in UC-B, a request that received an HTTP answer throws `ApiError` with the server's message. Only a request with no response falls back to offline mode. | UT-C232 to UT-C272 and UT-C274 (42 tests). UT-C273 covers delete-after-404, which was already correct. |
| 5 | `client/src/features/conflict-alerts/api/conflictAlertApi.ts` | Offline edits used the alert ID as the queue `clientId`. The shared queue merges items with the same `clientId`, so a second offline edit of an alert, or an edit or delete of a **different** response on the same alert, was dropped. After sync, the server's copy of the first edit overwrote the newer local edit. This is the same class of defect as UC-A defect 1. | Each alert or response edit gets its own queue ID. A response delete is keyed by alert and response. | UT-C288, UT-C289, UT-C304 |
| 6 | `client/src/features/conflict-alerts/components/CollarSimulatorModal.tsx`, `CommunityReportModal.tsx` | Coordinates were stored as `parseFloat(input)`. Typing a leading "-" gave `NaN`, and React cleared the field, so the minus sign was lost. **−2.5 was submitted as 2.5**, creating the alert in the wrong hemisphere. | The typed text is kept in state and converted on submit, which the forms already did. | UT-C345, UT-C348 |

Integration-test expectations that encoded the old behaviour were updated without being run: 500 → 409 for invalid transitions (6 assertions). One assertion that already disagreed with the shared error handler before this phase was also corrected: an unknown alert is 404, not 500.

### Known gaps (not changed in this phase)

- There is no animal registry, so unknown or inactive animal IDs are accepted. Those checks are not implemented and are therefore not tested.
- Risk zones are a fixed configuration list (`CONFIG_RISK_ZONES`) and are not stored per park.
- The proximity-based severity bands are applied only when no severity is given. The simulate-collar schema defaults severity to HIGH, and collar ingestion always passes HIGH, so through the API every collar alert is HIGH unless a severity is supplied. The bands are tested at service level.
- An audit-log failure after the alert row is written is reported to the caller as an error, although the alert exists. A test records this current behaviour.
- The offline client allows some transitions that the server rejects, for example acknowledging an already acknowledged alert, or resolving before a response. The UI does not offer these actions. If one is queued, the server answers 409, the queue item becomes FAILED, and no data is deleted.
- After a failed sync, the alert's device copy stays PENDING while the queue item is FAILED. The alerts page shows "Retry sync (n)".
- Reading the alert list or an alert falls back to the device cache on any error, not only when offline.
- The gateway HMAC is computed over the re-serialised JSON body, not the raw request bytes. A signature of the wrong length is rejected outright, while a well-formed wrong signature falls back to the API-key check.
- "Not found" and "Unauthorized" errors in this module are still plain `Error`s, which the shared handler maps by message text (404/403).
- The client's live-update `EventSource` is not available in jsdom and is not unit-tested; the server stream is.

### UC-C test cases

All rows below come from the Jest and Vitest JSON results of the final run. The type column was assigned by reviewing each test.

| Test ID | Use Case | Scenario | Type | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| UT-C001 | UC-C | Server · validation › collar reading (simulate-collar) validation | Positive | a minimal reading is accepted and defaults the alert type to DANGEROUS_WILDLIFE_ACTIVITY and severity to HIGH | Behaved as expected | Pass |
| UT-C002 | UC-C | Server · validation › collar reading (simulate-collar) validation | Positive | explicit park, event id, type, severity and description are retained | Behaved as expected | Pass |
| UT-C003 | UC-C | Server · validation › collar reading (simulate-collar) validation | Edge | latitude exactly -90 is on the valid boundary | Behaved as expected | Pass |
| UT-C004 | UC-C | Server · validation › collar reading (simulate-collar) validation | Edge | latitude exactly 90 is on the valid boundary | Behaved as expected | Pass |
| UT-C005 | UC-C | Server · validation › collar reading (simulate-collar) validation | Edge | longitude exactly -180 is on the valid boundary | Behaved as expected | Pass |
| UT-C006 | UC-C | Server · validation › collar reading (simulate-collar) validation | Edge | longitude exactly 180 is on the valid boundary | Behaved as expected | Pass |
| UT-C007 | UC-C | Server · validation › collar reading (simulate-collar) validation | Edge | coordinates 0,0 are valid | Behaved as expected | Pass |
| UT-C008 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | latitude -90.000001 just outside the range is rejected | Behaved as expected | Pass |
| UT-C009 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | latitude 90.000001 just outside the range is rejected | Behaved as expected | Pass |
| UT-C010 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | longitude -180.000001 just outside the range is rejected | Behaved as expected | Pass |
| UT-C011 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | longitude 180.000001 just outside the range is rejected | Behaved as expected | Pass |
| UT-C012 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | a malformed latitude (a numeric string) is rejected | Behaved as expected | Pass |
| UT-C013 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | a malformed latitude (NaN) is rejected | Behaved as expected | Pass |
| UT-C014 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | a malformed latitude (null) is rejected | Behaved as expected | Pass |
| UT-C015 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | a missing or empty animal ID is rejected with the documented message | Behaved as expected | Pass |
| UT-C016 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | missing coordinates are rejected | Behaved as expected | Pass |
| UT-C017 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | an unsupported alert type or severity is rejected | Behaved as expected | Pass |
| UT-C018 | UC-C | Server · validation › collar reading (simulate-collar) validation | Negative | an invalid park id is rejected | Behaved as expected | Pass |
| UT-C019 | UC-C | Server · validation › community report validation | Positive | a valid crop-raid report is accepted with the default reporter name and MEDIUM severity | Behaved as expected | Pass |
| UT-C020 | UC-C | Server · validation › community report validation | Positive | report type WILDLIFE_NEAR_COMMUNITY is accepted | Behaved as expected | Pass |
| UT-C021 | UC-C | Server · validation › community report validation | Positive | report type WILDLIFE_NEAR_RANGER is accepted | Behaved as expected | Pass |
| UT-C022 | UC-C | Server · validation › community report validation | Positive | report type CROP_RAID is accepted | Behaved as expected | Pass |
| UT-C023 | UC-C | Server · validation › community report validation | Positive | report type LIVESTOCK_THREAT is accepted | Behaved as expected | Pass |
| UT-C024 | UC-C | Server · validation › community report validation | Positive | report type DANGEROUS_WILDLIFE_ACTIVITY is accepted | Behaved as expected | Pass |
| UT-C025 | UC-C | Server · validation › community report validation | Positive | report type OTHER is accepted | Behaved as expected | Pass |
| UT-C026 | UC-C | Server · validation › community report validation | Edge | the shortest permitted description is exactly 5 characters | Behaved as expected | Pass |
| UT-C027 | UC-C | Server · validation › community report validation | Negative | missing description, type and location are each reported | Behaved as expected | Pass |
| UT-C028 | UC-C | Server · validation › community report validation | Negative | an out-of-range community location is rejected | Behaved as expected | Pass |
| UT-C029 | UC-C | Server · validation › community report validation | Edge | a non-string reporter name is rejected but an absent one is optional | Behaved as expected | Pass |
| UT-C030 | UC-C | Server · validation › community report validation | Edge | coordinates on the exact boundaries are accepted | Behaved as expected | Pass |
| UT-C031 | UC-C | Server · validation › direct alert creation validation | Positive | a valid alert defaults its location source to GPS | Behaved as expected | Pass |
| UT-C032 | UC-C | Server · validation › direct alert creation validation | Negative | source, type and severity must be supported values | Behaved as expected | Pass |
| UT-C033 | UC-C | Server · validation › direct alert creation validation | Edge | the description must have at least 3 characters | Behaved as expected | Pass |
| UT-C034 | UC-C | Server · validation › direct alert creation validation | Edge | the shared location schema applies the same coordinate limits | Behaved as expected | Pass |
| UT-C035 | UC-C | Server · validation › response, acknowledgement and resolution validation | Edge | acknowledgement accepts an empty body or a non-empty client acknowledgement id | Behaved as expected | Pass |
| UT-C036 | UC-C | Server · validation › response, acknowledgement and resolution validation | Positive | a field response defaults markResolved to false | Behaved as expected | Pass |
| UT-C037 | UC-C | Server · validation › response, acknowledgement and resolution validation | Negative | response notes need 3 characters and the action must be supported | Behaved as expected | Pass |
| UT-C038 | UC-C | Server · validation › response, acknowledgement and resolution validation | Negative | resolution requires notes of at least 3 characters | Behaved as expected | Pass |
| UT-C039 | UC-C | Server · validation › response, acknowledgement and resolution validation | Negative | cancellation requires a reason; deletion reason is optional but must be 3+ characters | Behaved as expected | Pass |
| UT-C040 | UC-C | Server · validation › response, acknowledgement and resolution validation | Negative | alert and response updates require at least one editable field | Behaved as expected | Pass |
| UT-C041 | UC-C | Server · validation › response, acknowledgement and resolution validation | Negative | alert updates validate coordinates and enum values | Behaved as expected | Pass |
| UT-C042 | UC-C | Server · service › createAlert | Positive | persists a new OPEN, SYNCED alert with its location and source, audits CREATE and notifies responders | Behaved as expected | Pass |
| UT-C043 | UC-C | Server · service › createAlert | Edge | generates a source event id and fills the collar animal / community reporter defaults | Behaved as expected | Pass |
| UT-C044 | UC-C | Server · service › createAlert | Edge | a repeated source event id returns the stored alert without creating, auditing or notifying again | Behaved as expected | Pass |
| UT-C045 | UC-C | Server · service › createAlert | Edge | a repeated client alert id is idempotent | Behaved as expected | Pass |
| UT-C046 | UC-C | Server · service › createAlert | Negative | an explicit existing park is stored; an unknown park is rejected before anything is written | Behaved as expected | Pass |
| UT-C047 | UC-C | Server · service › createAlert | Error | a database failure while creating propagates and nothing is audited or notified | Behaved as expected | Pass |
| UT-C048 | UC-C | Server · service › createAlert | Error | an audit failure after the alert is persisted is reported to the caller (alert row already written) | Behaved as expected | Pass |
| UT-C049 | UC-C | Server · service › notification failure | Error | a failed responder notification does not lose the persisted alert: it is still returned and the failure is logged | Behaved as expected | Pass |
| UT-C050 | UC-C | Server · service › notification failure | Error | a collar breach still reports alertCreated when notification fails | Behaved as expected | Pass |
| UT-C051 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Positive | a reading inside a risk zone creates an OPEN COLLAR alert with the animal, location and zone | Behaved as expected | Pass |
| UT-C052 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Positive | a valid reading outside every risk zone stays telemetry only: no alert is looked up, created, audited or notified | Behaved as expected | Pass |
| UT-C053 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Edge | coordinates 0,0 are far from the configured zones and create no alert | Behaved as expected | Pass |
| UT-C054 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Edge | when zones overlap the first configured zone is reported (village centre lies in the northern buffer) | Behaved as expected | Pass |
| UT-C055 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Positive | a point only inside the southern livestock zone is attributed to that zone | Behaved as expected | Pass |
| UT-C056 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Positive | an explicit upstream event id is used and an explicit park gets its own generated key | Behaved as expected | Pass |
| UT-C057 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Edge | a repeated breach for the same animal and position returns the existing alert (idempotent) | Behaved as expected | Pass |
| UT-C058 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Error | alert creation failure inside a zone propagates instead of reporting a created alert | Behaved as expected | Pass |
| UT-C059 | UC-C | Server · service › GPS collar alert generation against the configured risk zones | Error | a database read failure during the idempotency check propagates and nothing is created | Behaved as expected | Pass |
| UT-C060 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | without an explicit severity, a point 0° from the centre is rated by proximity as CRITICAL | Behaved as expected | Pass |
| UT-C061 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Positive | without an explicit severity, a point 0.02° from the centre is rated by proximity as CRITICAL | Behaved as expected | Pass |
| UT-C062 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Positive | without an explicit severity, a point 0.04° from the centre is rated by proximity as HIGH | Behaved as expected | Pass |
| UT-C063 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Positive | without an explicit severity, a point 0.07° from the centre is rated by proximity as MEDIUM | Behaved as expected | Pass |
| UT-C064 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Positive | without an explicit severity, a point 0.085° from the centre is rated by proximity as LOW | Behaved as expected | Pass |
| UT-C065 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Positive | an explicit severity overrides the proximity rating | Behaved as expected | Pass |
| UT-C066 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | near the boundary: 4.99 km inside a 5 km zone alerts, 5.01 km outside does not | Behaved as expected | Pass |
| UT-C067 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | the boundary is inclusive: distance exactly equal to the radius (0 km of a 0 km zone) is inside | Behaved as expected | Pass |
| UT-C068 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | a zone at 0,0 makes 0,0 a valid in-zone position | Behaved as expected | Pass |
| UT-C069 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | with no zones configured nothing ever alerts | Behaved as expected | Pass |
| UT-C070 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Error | malformed zone data (a NaN radius) never produces a false positive alert | Behaved as expected | Pass |
| UT-C071 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Error | malformed zone data (a NaN centre latitude) never produces a false positive alert | Behaved as expected | Pass |
| UT-C072 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Error | malformed zone data (an undefined centre longitude) never produces a false positive alert | Behaved as expected | Pass |
| UT-C073 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Negative | malformed reading coordinates that bypass validation (NaN) never produce an alert | Behaved as expected | Pass |
| UT-C074 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Error | if the risk-zone calculation throws, the error propagates and no alert is created | Behaved as expected | Pass |
| UT-C075 | UC-C | Server · service › risk-zone spatial logic (deterministic test zones) | Edge | of several matching zones the first in configuration order wins | Behaved as expected | Pass |
| UT-C076 | UC-C | Server · service › community report workflow | Positive | creates an OPEN COMMUNITY_REPORT alert with manual location, description and reporter | Behaved as expected | Pass |
| UT-C077 | UC-C | Server · service › community report workflow | Edge | community reports create alerts regardless of risk zones (0,0 accepted) and get a generated event id | Behaved as expected | Pass |
| UT-C078 | UC-C | Server · service › community report workflow | Edge | an absent reporter name is stored as "Community Member" | Behaved as expected | Pass |
| UT-C079 | UC-C | Server · service › community report workflow | Positive | without a severity, a DANGEROUS_WILDLIFE_ACTIVITY report is rated HIGH | Behaved as expected | Pass |
| UT-C080 | UC-C | Server · service › community report workflow | Positive | without a severity, a LIVESTOCK_THREAT report is rated HIGH | Behaved as expected | Pass |
| UT-C081 | UC-C | Server · service › community report workflow | Positive | without a severity, a CROP_RAID report is rated MEDIUM | Behaved as expected | Pass |
| UT-C082 | UC-C | Server · service › community report workflow | Positive | without a severity, a WILDLIFE_NEAR_COMMUNITY report is rated LOW | Behaved as expected | Pass |
| UT-C083 | UC-C | Server · service › community report workflow | Positive | without a severity, a OTHER report is rated LOW | Behaved as expected | Pass |
| UT-C084 | UC-C | Server · service › community report workflow | Error | a database failure is reported and no audit entry is written | Behaved as expected | Pass |
| UT-C085 | UC-C | Server · service › alert retrieval | Edge | without filters, at most 5 active alerts plus all historical alerts are merged newest first | Behaved as expected | Pass |
| UT-C086 | UC-C | Server · service › alert retrieval | Positive | an active status filter queries only active alerts with that status | Behaved as expected | Pass |
| UT-C087 | UC-C | Server · service › alert retrieval | Positive | a historical status filter queries only historical alerts; includeDeleted drops the deleted filter | Behaved as expected | Pass |
| UT-C088 | UC-C | Server · service › alert retrieval | Edge | no matching alerts returns an empty list | Behaved as expected | Pass |
| UT-C089 | UC-C | Server · service › alert retrieval | Positive | an alert is found by server id or client id, excluding deleted alerts unless requested | Behaved as expected | Pass |
| UT-C090 | UC-C | Server · service › alert retrieval | Negative | an unknown alert is reported as not found | Behaved as expected | Pass |
| UT-C091 | UC-C | Server · service › acknowledge | Positive | an OPEN alert becomes ACKNOWLEDGED with the responder and time stored and an audit entry | Behaved as expected | Pass |
| UT-C092 | UC-C | Server · service › acknowledge | Edge | a replayed acknowledgement with the same client id returns the alert unchanged (offline retry) | Behaved as expected | Pass |
| UT-C093 | UC-C | Server · service › acknowledge | Negative | an unknown alert cannot be acknowledged | Behaved as expected | Pass |
| UT-C094 | UC-C | Server · service › acknowledge | Negative | a RESOLVED alert cannot be acknowledged | Behaved as expected | Pass |
| UT-C095 | UC-C | Server · service › acknowledge | Negative | a ACKNOWLEDGED alert cannot be acknowledged again | Behaved as expected | Pass |
| UT-C096 | UC-C | Server · service › acknowledge | Negative | a RESPONDING alert cannot be acknowledged again | Behaved as expected | Pass |
| UT-C097 | UC-C | Server · service › acknowledge | Negative | a CANCELLED alert cannot be acknowledged again | Behaved as expected | Pass |
| UT-C098 | UC-C | Server · service › respond | Positive | a response on an ACKNOWLEDGED alert is stored with responder, action, notes, outcome and time; status becomes RESPONDING | Behaved as expected | Pass |
| UT-C099 | UC-C | Server · service › respond | Positive | additional responses are allowed while RESPONDING | Behaved as expected | Pass |
| UT-C100 | UC-C | Server · service › respond | Positive | markResolved records the response and resolves the alert in one step, auditing both | Behaved as expected | Pass |
| UT-C101 | UC-C | Server · service › respond | Positive | markResolved without resolution notes stores the response notes as the resolution | Behaved as expected | Pass |
| UT-C102 | UC-C | Server · service › respond | Edge | a replayed response with an existing client response id is not stored twice | Behaved as expected | Pass |
| UT-C103 | UC-C | Server · service › respond | Negative | an OPEN alert must be acknowledged before a response is recorded | Behaved as expected | Pass |
| UT-C104 | UC-C | Server · service › respond | Negative | a RESOLVED alert cannot accept new responses | Behaved as expected | Pass |
| UT-C105 | UC-C | Server · service › respond | Negative | a CANCELLED alert cannot accept responses | Behaved as expected | Pass |
| UT-C106 | UC-C | Server · service › respond | Error | an unknown alert or a failed write is reported without an audit entry | Behaved as expected | Pass |
| UT-C107 | UC-C | Server · service › resolve | Positive | a RESPONDING alert is RESOLVED with resolver, time, notes and client action id stored and audited | Behaved as expected | Pass |
| UT-C108 | UC-C | Server · service › resolve | Edge | a replayed resolution with the same client action id is idempotent | Behaved as expected | Pass |
| UT-C109 | UC-C | Server · service › resolve | Negative | a OPEN alert cannot be resolved before a response is recorded | Behaved as expected | Pass |
| UT-C110 | UC-C | Server · service › resolve | Negative | a ACKNOWLEDGED alert cannot be resolved before a response is recorded | Behaved as expected | Pass |
| UT-C111 | UC-C | Server · service › resolve | Negative | a CANCELLED alert cannot be resolved before a response is recorded | Behaved as expected | Pass |
| UT-C112 | UC-C | Server · service › resolve | Negative | an already RESOLVED alert cannot be resolved again | Behaved as expected | Pass |
| UT-C113 | UC-C | Server · service › resolve | Negative | an unknown alert cannot be resolved | Behaved as expected | Pass |
| UT-C114 | UC-C | Server · service › update, cancel and delete | Positive | editing description and severity keeps the stored location and audits the old values | Behaved as expected | Pass |
| UT-C115 | UC-C | Server · service › update, cancel and delete | Positive | editing one coordinate merges it into the existing location | Behaved as expected | Pass |
| UT-C116 | UC-C | Server · service › update, cancel and delete | Negative | a RESOLVED alert is read-only | Behaved as expected | Pass |
| UT-C117 | UC-C | Server · service › update, cancel and delete | Negative | a CANCELLED alert is read-only | Behaved as expected | Pass |
| UT-C118 | UC-C | Server · service › update, cancel and delete | Positive | cancelling an active alert stores CANCELLED and audits the reason | Behaved as expected | Pass |
| UT-C119 | UC-C | Server · service › update, cancel and delete | Negative | a RESOLVED alert cannot be cancelled | Behaved as expected | Pass |
| UT-C120 | UC-C | Server · service › update, cancel and delete | Negative | a CANCELLED alert cannot be cancelled | Behaved as expected | Pass |
| UT-C121 | UC-C | Server · service › update, cancel and delete | Positive | deleting soft-deletes with the ranger, time and reason (default reason when none given) | Behaved as expected | Pass |
| UT-C122 | UC-C | Server · service › update, cancel and delete | Negative | update, cancel and delete of an unknown alert are reported as not found | Behaved as expected | Pass |
| UT-C123 | UC-C | Server · service › responses and history | Negative | getResponses returns the alert responses; unknown alert is not found | Behaved as expected | Pass |
| UT-C124 | UC-C | Server · service › responses and history | Positive | the original responder can edit a response; the change is audited and the refreshed alert returned | Behaved as expected | Pass |
| UT-C125 | UC-C | Server · service › responses and history | Positive | the original responder can soft-delete a response | Behaved as expected | Pass |
| UT-C126 | UC-C | Server · service › responses and history | Negative | another ranger may not edit or delete the response | Behaved as expected | Pass |
| UT-C127 | UC-C | Server · service › responses and history | Negative | unknown responses, unknown alerts and terminal alerts are rejected | Behaved as expected | Pass |
| UT-C128 | UC-C | Server · service › responses and history | Positive | history includes deleted alerts and is ordered oldest first | Behaved as expected | Pass |
| UT-C129 | UC-C | Server · routes › alert creation | Positive | POST /simulate-collar returns 201 with the service result; omitted type and severity get schema defaults | Behaved as expected | Pass |
| UT-C130 | UC-C | Server · routes › alert creation | Positive | a collar reading outside every zone is still a 201 that reports alertCreated: false | Behaved as expected | Pass |
| UT-C131 | UC-C | Server · routes › alert creation | Negative | invalid collar coordinates are a 400 and never reach the service | Behaved as expected | Pass |
| UT-C132 | UC-C | Server · routes › alert creation | Positive | POST /community-report returns 201 with the default reporter and severity applied | Behaved as expected | Pass |
| UT-C133 | UC-C | Server · routes › alert creation | Negative | a community report without location or description is a 400 | Behaved as expected | Pass |
| UT-C134 | UC-C | Server · routes › alert creation | Positive | POST / creates a direct alert with 201 | Behaved as expected | Pass |
| UT-C135 | UC-C | Server · routes › alert creation | Error | an unexpected failure while creating is a 500 | Behaved as expected | Pass |
| UT-C136 | UC-C | Server · routes › retrieval | Positive | GET / passes status, severity and type filters and includeDeleted only when "true" | Behaved as expected | Pass |
| UT-C137 | UC-C | Server · routes › retrieval | Negative | GET /:id returns the alert; an unknown alert is a 404 with the not-found message | Behaved as expected | Pass |
| UT-C138 | UC-C | Server · routes › retrieval | Positive | responses and history are returned for an alert | Behaved as expected | Pass |
| UT-C139 | UC-C | Server · routes › retrieval | Error | read failures are 500s | Behaved as expected | Pass |
| UT-C140 | UC-C | Server · routes › lifecycle actions | Positive | acknowledge uses the ranger headers and the client acknowledgement id | Behaved as expected | Pass |
| UT-C141 | UC-C | Server · routes › lifecycle actions | Edge | without ranger headers the demo ranger is used; an empty body is accepted | Behaved as expected | Pass |
| UT-C142 | UC-C | Server · routes › lifecycle actions | Negative | an invalid lifecycle transition is a 409 with the transition message and code | Behaved as expected | Pass |
| UT-C143 | UC-C | Server · routes › lifecycle actions | Positive | a field response is recorded with markResolved defaulted to false | Behaved as expected | Pass |
| UT-C144 | UC-C | Server · routes › lifecycle actions | Negative | a response with too-short notes is a 400; responding to an OPEN alert is a 409 | Behaved as expected | Pass |
| UT-C145 | UC-C | Server · routes › lifecycle actions | Negative | resolve requires notes; resolving before a response is a 409; success returns RESOLVED | Behaved as expected | Pass |
| UT-C146 | UC-C | Server · routes › lifecycle actions | Negative | cancel requires a reason and maps a terminal-state cancel to 409 | Behaved as expected | Pass |
| UT-C147 | UC-C | Server · routes › lifecycle actions | Error | an unexpected failure during a lifecycle action is a 500 | Behaved as expected | Pass |
| UT-C148 | UC-C | Server · routes › edit and delete | Positive | PUT /:id validates the edit and passes it on | Behaved as expected | Pass |
| UT-C149 | UC-C | Server · routes › edit and delete | Negative | editing a read-only alert is a 403 | Behaved as expected | Pass |
| UT-C150 | UC-C | Server · routes › edit and delete | Negative | DELETE /:id soft-deletes with an optional reason; unknown alerts are 404 | Behaved as expected | Pass |
| UT-C151 | UC-C | Server · routes › edit and delete | Negative | responses can be edited and deleted by id; another ranger gets 403 | Behaved as expected | Pass |
| UT-C152 | UC-C | Server · routes › edit and delete | Negative | edit/delete failures are passed to the error handler | Behaved as expected | Pass |
| UT-C153 | UC-C | Server · collar ingestion › collar telemetry validation | Positive | a complete reading with an ISO timestamp (UTC or offset) is accepted | Behaved as expected | Pass |
| UT-C154 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | latitude = -90 is on the valid boundary | Behaved as expected | Pass |
| UT-C155 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | latitude = 90 is on the valid boundary | Behaved as expected | Pass |
| UT-C156 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | longitude = -180 is on the valid boundary | Behaved as expected | Pass |
| UT-C157 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | longitude = 180 is on the valid boundary | Behaved as expected | Pass |
| UT-C158 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | batteryPercent = 0 is on the valid boundary | Behaved as expected | Pass |
| UT-C159 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | batteryPercent = 100 is on the valid boundary | Behaved as expected | Pass |
| UT-C160 | UC-C | Server · collar ingestion › collar telemetry validation | Edge | accuracyMeters = 0 is on the valid boundary | Behaved as expected | Pass |
| UT-C161 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | latitude = -90.1 is rejected | Behaved as expected | Pass |
| UT-C162 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | latitude = 90.1 is rejected | Behaved as expected | Pass |
| UT-C163 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | longitude = -180.1 is rejected | Behaved as expected | Pass |
| UT-C164 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | longitude = 180.1 is rejected | Behaved as expected | Pass |
| UT-C165 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | latitude = Infinity is rejected | Behaved as expected | Pass |
| UT-C166 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | longitude = "34.8" is rejected | Behaved as expected | Pass |
| UT-C167 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | batteryPercent = 101 is rejected | Behaved as expected | Pass |
| UT-C168 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | batteryPercent = 50.5 is rejected | Behaved as expected | Pass |
| UT-C169 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | accuracyMeters = -1 is rejected | Behaved as expected | Pass |
| UT-C170 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a missing or empty eventId is rejected | Behaved as expected | Pass |
| UT-C171 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a missing or empty deviceId is rejected | Behaved as expected | Pass |
| UT-C172 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a missing or empty animalId is rejected | Behaved as expected | Pass |
| UT-C173 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a malformed timestamp "2026-10-09" is rejected | Behaved as expected | Pass |
| UT-C174 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a malformed timestamp "09/10/2026 08:00" is rejected | Behaved as expected | Pass |
| UT-C175 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a malformed timestamp "yesterday" is rejected | Behaved as expected | Pass |
| UT-C176 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | a malformed timestamp "" is rejected | Behaved as expected | Pass |
| UT-C177 | UC-C | Server · collar ingestion › collar telemetry validation | Negative | an unsupported alert type or a too-short description is rejected | Behaved as expected | Pass |
| UT-C178 | UC-C | Server · collar ingestion › vendor payload normalisation | Positive | a payload already in the canonical shape is validated as-is | Behaved as expected | Pass |
| UT-C179 | UC-C | Server · collar ingestion › vendor payload normalisation | Positive | a TTN / LoRaWAN uplink is mapped to a canonical reading | Behaved as expected | Pass |
| UT-C180 | UC-C | Server · collar ingestion › vendor payload normalisation | Positive | flat alias fields (device_id, animal_id, lat, lng, timestamp) are recognised | Behaved as expected | Pass |
| UT-C181 | UC-C | Server · collar ingestion › vendor payload normalisation | Edge | missing identifiers fall back to an UNKNOWN-DEVICE id and a generated event id; an unparseable time uses now | Behaved as expected | Pass |
| UT-C182 | UC-C | Server · collar ingestion › vendor payload normalisation | Negative | a vendor payload without coordinates is rejected instead of being stored at NaN | Behaved as expected | Pass |
| UT-C183 | UC-C | Server · collar ingestion › vendor payload normalisation | Negative | vendor coordinates out of range are rejected | Behaved as expected | Pass |
| UT-C184 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Positive | the correct key in x-collar-api-key lets the request continue | Behaved as expected | Pass |
| UT-C185 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Positive | the correct key in x-api-key lets the request continue | Behaved as expected | Pass |
| UT-C186 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Positive | the correct key in Bearer authorization lets the request continue | Behaved as expected | Pass |
| UT-C187 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | a missing key is rejected with 401 | Behaved as expected | Pass |
| UT-C188 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | a wrong key, a key differing only in case, or a non-Bearer scheme is rejected | Behaved as expected | Pass |
| UT-C189 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | when neither a key nor a secret is configured, ingestion is unavailable (503) even with a key supplied | Behaved as expected | Pass |
| UT-C190 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Positive | a valid HMAC-SHA256 signature of the body is accepted without a key (plain or "sha256=" prefixed) | Behaved as expected | Pass |
| UT-C191 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | a signature made with the wrong secret or for a different body is rejected | Behaved as expected | Pass |
| UT-C192 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | a malformed (wrong-length) signature is rejected as an invalid HMAC even when a valid key is present | Behaved as expected | Pass |
| UT-C193 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Edge | a well-formed but wrong signature falls back to the API-key check | Behaved as expected | Pass |
| UT-C194 | UC-C | Server · collar ingestion › collar gateway middleware (API key / HMAC signature) | Negative | a signature is ignored when no webhook secret is configured | Behaved as expected | Pass |
| UT-C195 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Positive | a new reading inside a risk zone is stored, raises a COLLAR alert, is marked alertCreated and broadcast | Behaved as expected | Pass |
| UT-C196 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Positive | a reading outside every zone is stored as tracking data only: no alert, no alert broadcast | Behaved as expected | Pass |
| UT-C197 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Edge | a duplicate event whose alert was already raised is acknowledged without storing or alerting again | Behaved as expected | Pass |
| UT-C198 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Edge | a duplicate outside-zone event stays a duplicate without an alert or broadcast | Behaved as expected | Pass |
| UT-C199 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Error | if alert creation fails after the reading was stored, the error is reported and the reading is not marked alerted | Behaved as expected | Pass |
| UT-C200 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Error | regression: a gateway retry after a failed alert step raises the missing alert instead of reporting a harmless duplicate | Behaved as expected | Pass |
| UT-C201 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Error | a telemetry persistence failure is reported and no alert is created | Behaved as expected | Pass |
| UT-C202 | UC-C | Server · collar ingestion › telemetry ingestion and risk-zone alerting | Error | a database read failure on the duplicate check is reported and nothing is written | Behaved as expected | Pass |
| UT-C203 | UC-C | Server · collar ingestion › collar device monitoring | Positive | readings are grouped per device using the newest reading, counting all readings | Behaved as expected | Pass |
| UT-C204 | UC-C | Server · collar ingestion › collar device monitoring | Edge | a collar is ONLINE up to exactly 24 hours since its last reading and OFFLINE after that | Behaved as expected | Pass |
| UT-C205 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery null is classified UNKNOWN | Behaved as expected | Pass |
| UT-C206 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery 0 is classified CRITICAL | Behaved as expected | Pass |
| UT-C207 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery 20 is classified CRITICAL | Behaved as expected | Pass |
| UT-C208 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery 21 is classified WARNING | Behaved as expected | Pass |
| UT-C209 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery 50 is classified WARNING | Behaved as expected | Pass |
| UT-C210 | UC-C | Server · collar ingestion › collar device monitoring | Edge | battery 51 is classified GOOD | Behaved as expected | Pass |
| UT-C211 | UC-C | Server · collar ingestion › collar device monitoring | Positive | stats count online, offline, low-battery (<= 20%) and in-zone collars | Behaved as expected | Pass |
| UT-C212 | UC-C | Server · collar ingestion › collar device monitoring | Edge | no telemetry means no devices and zeroed stats | Behaved as expected | Pass |
| UT-C213 | UC-C | Server · collar ingestion › collar device monitoring | Edge | telemetry history matches device or animal id, newest first, capped at 100 | Behaved as expected | Pass |
| UT-C214 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Positive | POST /collar-location with a valid key accepts a new reading with 202 | Behaved as expected | Pass |
| UT-C215 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Edge | a duplicate delivery is answered with 200 | Behaved as expected | Pass |
| UT-C216 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Negative | a rejected gateway request never reaches the ingestion service | Behaved as expected | Pass |
| UT-C217 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Negative | an invalid reading is a 400 validation error and never reaches the service | Behaved as expected | Pass |
| UT-C218 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Positive | a signed vendor webhook is normalised and tagged with the vendor | Behaved as expected | Pass |
| UT-C219 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Error | an unexpected ingestion failure becomes a 500 | Behaved as expected | Pass |
| UT-C220 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Positive | GET /collars returns devices with stats; GET telemetry returns the device history | Behaved as expected | Pass |
| UT-C221 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Error | monitoring read failures become 500 | Behaved as expected | Pass |
| UT-C222 | UC-C | Server · collar ingestion › collar ingestion HTTP routes | Positive | the live stream sends a ping, forwards telemetry and alert events, and unsubscribes when the client disconnects | Behaved as expected | Pass |
| UT-C223 | UC-C | Client · conflictAlertApi › online requests | Positive | getAlerts sends the filters as query parameters and caches every alert as SYNCED | Behaved as expected | Pass |
| UT-C224 | UC-C | Client · conflictAlertApi › online requests | Positive | refreshing the list updates an existing cached copy instead of duplicating it | Behaved as expected | Pass |
| UT-C225 | UC-C | Client · conflictAlertApi › online requests | Positive | getAlertById and getHistory read the server | Behaved as expected | Pass |
| UT-C226 | UC-C | Client · conflictAlertApi › online requests | Positive | acknowledgeAlert posts a client acknowledgement id and caches the server result as SYNCED | Behaved as expected | Pass |
| UT-C227 | UC-C | Client · conflictAlertApi › online requests | Positive | addResponse, resolveAlert, updateAlert and cancelAlert call the matching endpoints with their payloads | Behaved as expected | Pass |
| UT-C228 | UC-C | Client · conflictAlertApi › online requests | Positive | deleteAlert, updateResponse and deleteResponse call the matching endpoints | Behaved as expected | Pass |
| UT-C229 | UC-C | Client · conflictAlertApi › online requests | Positive | simulateCollar sends the reading with a generated event id and returns the server result | Behaved as expected | Pass |
| UT-C230 | UC-C | Client · conflictAlertApi › online requests | Positive | an outside-zone collar reading returns the telemetry-only answer (no alert) | Behaved as expected | Pass |
| UT-C231 | UC-C | Client · conflictAlertApi › online requests | Positive | submitCommunityReport posts the report with a generated event id | Behaved as expected | Pass |
| UT-C232 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | acknowledgeAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C233 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | addResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C234 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | resolveAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C235 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | updateAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C236 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | cancelAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C237 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | deleteAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C238 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | updateResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C239 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | deleteResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C240 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | simulateCollar throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C241 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 400 | Negative | submitCommunityReport throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C242 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | acknowledgeAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C243 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | addResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C244 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | resolveAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C245 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | updateAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C246 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | cancelAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C247 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | deleteAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C248 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | updateResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C249 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | deleteResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C250 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | simulateCollar throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C251 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 403 | Negative | submitCommunityReport throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C252 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | acknowledgeAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C253 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | addResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C254 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | resolveAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C255 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | updateAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C256 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | cancelAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C257 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | deleteAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C258 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | updateResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C259 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | deleteResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C260 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | simulateCollar throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C261 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 409 | Negative | submitCommunityReport throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C262 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | acknowledgeAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C263 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | addResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C264 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | resolveAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C265 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | updateAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C266 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | cancelAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C267 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | deleteAlert throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C268 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | updateResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C269 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | deleteResponse throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C270 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | simulateCollar throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C271 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline › HTTP 500 | Error | submitCommunityReport throws the server message and leaves the device copy and queue untouched | Behaved as expected | Pass |
| UT-C272 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline | Negative | HTTP 404 on an action (other than delete) is shown as not found and nothing is queued | Behaved as expected | Pass |
| UT-C273 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline | Edge | HTTP 404 on delete means the alert is already gone: the device copy is removed and nothing is queued | Behaved as expected | Pass |
| UT-C274 | UC-C | Client · conflictAlertApi › a server rejection is shown, not treated as being offline | Negative | a 409 invalid transition keeps the exact lifecycle message for the ranger | Behaved as expected | Pass |
| UT-C275 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | acknowledge offline: the device copy becomes ACKNOWLEDGED + PENDING and one ACKNOWLEDGE_ALERT is queued | Behaved as expected | Pass |
| UT-C276 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | a request timeout (no response) is also treated as offline | Behaved as expected | Pass |
| UT-C277 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Negative | acknowledging a RESOLVED alert offline is refused and nothing is queued | Behaved as expected | Pass |
| UT-C278 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | respond offline: the response keeps action, notes, outcome and responder, the alert is RESPONDING + PENDING | Behaved as expected | Pass |
| UT-C279 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | respond-and-resolve offline records the resolution locally | Behaved as expected | Pass |
| UT-C280 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Negative | responding offline to a OPEN alert is refused | Behaved as expected | Pass |
| UT-C281 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Negative | responding offline to a RESOLVED alert is refused | Behaved as expected | Pass |
| UT-C282 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | resolve offline: RESOLVED + PENDING locally, earlier responses retained, RESOLVE_ALERT queued with its client action id | Behaved as expected | Pass |
| UT-C283 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Negative | resolving an already resolved alert offline is refused | Behaved as expected | Pass |
| UT-C284 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | update offline merges the edit and new coordinates into the device copy and queues UPDATE_ALERT | Behaved as expected | Pass |
| UT-C285 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | cancel offline marks the alert CANCELLED; a resolved alert cannot be cancelled | Behaved as expected | Pass |
| UT-C286 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | delete offline keeps the record on the device marked deleted and PENDING until the server confirms | Behaved as expected | Pass |
| UT-C287 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | editing and deleting a response offline updates the device copy and queues both | Behaved as expected | Pass |
| UT-C288 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | regression: a second offline edit of the same alert is queued too, so the newer edit is not lost | Behaved as expected | Pass |
| UT-C289 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | regression: offline edits to two different responses of one alert are both queued | Behaved as expected | Pass |
| UT-C290 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | an action on an alert that is neither reachable nor cached reports it as not found | Behaved as expected | Pass |
| UT-C291 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Error | a collar reading and a community report are queued with their event ids and return null | Behaved as expected | Pass |
| UT-C292 | UC-C | Client · conflictAlertApi › a lost connection switches to offline field mode | Edge | the same community report queued twice (same event id) is stored once | Behaved as expected | Pass |
| UT-C293 | UC-C | Client · conflictAlertApi › offline alert list | Error | cached alerts are served newest first with their sync status and the requested filters | Behaved as expected | Pass |
| UT-C294 | UC-C | Client · conflictAlertApi › offline alert list | Edge | like the server, at most 5 active alerts are listed but every historical alert is kept | Behaved as expected | Pass |
| UT-C295 | UC-C | Client · conflictAlertApi › offline alert list | Error | with nothing cached the list fails clearly | Behaved as expected | Pass |
| UT-C296 | UC-C | Client · conflictAlertApi › offline alert list | Error | getAlertById serves the cached copy offline | Behaved as expected | Pass |
| UT-C297 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Positive | PENDING -> reconnect -> server accepts -> queue SYNCED and the device copy holds the server alert | Behaved as expected | Pass |
| UT-C298 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Error | a lost connection during sync keeps the item PENDING for an automatic retry and keeps the local alert | Behaved as expected | Pass |
| UT-C299 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Error | a server rejection during sync marks the item FAILED but never deletes the local alert or its response | Behaved as expected | Pass |
| UT-C300 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Error | Retry: FAILED -> retryFailed -> server accepts -> SYNCED | Behaved as expected | Pass |
| UT-C301 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Positive | every queued operation is replayed to its endpoint with the stored payload | Behaved as expected | Pass |
| UT-C302 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Edge | cancel and delete are replayed with their reason; a delete answered 404 removes the device copy | Behaved as expected | Pass |
| UT-C303 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Error | a delete rejected with another error during sync stays queued as FAILED and keeps the device copy | Behaved as expected | Pass |
| UT-C304 | UC-C | Client · conflictAlertApi › synchronising offline field actions | Edge | regression: two offline edits sync in order, so the device ends with the newer edit | Behaved as expected | Pass |
| UT-C305 | UC-C | Client · pages › ConflictAlertsPage | Positive | shows a loading state, then the alert cards with the active count | Behaved as expected | Pass |
| UT-C306 | UC-C | Client · pages › ConflictAlertsPage | Edge | an empty list shows the quiet-boundaries empty state | Behaved as expected | Pass |
| UT-C307 | UC-C | Client · pages › ConflictAlertsPage | Error | a load failure shows the error message | Behaved as expected | Pass |
| UT-C308 | UC-C | Client · pages › ConflictAlertsPage | Positive | choosing historical or active status and severity filters reloads the list with those filters | Behaved as expected | Pass |
| UT-C309 | UC-C | Client · pages › ConflictAlertsPage | Positive | Refresh reloads the alerts | Behaved as expected | Pass |
| UT-C310 | UC-C | Client · pages › ConflictAlertsPage | Positive | pending and syncing queue items are announced | Behaved as expected | Pass |
| UT-C311 | UC-C | Client · pages › ConflictAlertsPage | Error | failed synchronisation offers Retry sync, which retries the queue and reloads the alerts | Behaved as expected | Pass |
| UT-C312 | UC-C | Client · pages › ConflictAlertsPage | Positive | collar simulator inside a risk zone: the new alert appears after the reading is sent | Behaved as expected | Pass |
| UT-C313 | UC-C | Client · pages › ConflictAlertsPage | Positive | collar simulator outside every zone: no alert card is shown | Behaved as expected | Pass |
| UT-C314 | UC-C | Client · pages › ConflictAlertsPage | Negative | collar simulator with invalid coordinates shows the server rejection and stays open | Behaved as expected | Pass |
| UT-C315 | UC-C | Client · pages › ConflictAlertsPage | Negative | a community report is submitted from the modal; a failure is shown in the modal | Behaved as expected | Pass |
| UT-C316 | UC-C | Client · pages › ConflictAlertsPage | Positive | deleting from the list asks for confirmation, removes the card and reports a pending offline delete | Behaved as expected | Pass |
| UT-C317 | UC-C | Client · pages › ConflictAlertsPage | Negative | a failed delete shows the error and keeps the card | Behaved as expected | Pass |
| UT-C318 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | shows a loading state, then the source, coordinates, sync status and map location | Behaved as expected | Pass |
| UT-C319 | UC-C | Client · pages › ConflictAlertDetailPage | Error | a community alert shows its reporter; PENDING and FAILED sync states are visible | Behaved as expected | Pass |
| UT-C320 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | an unknown alert shows the not-found message | Behaved as expected | Pass |
| UT-C321 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | acknowledging an OPEN alert online confirms synchronisation and shows the responder in the history | Behaved as expected | Pass |
| UT-C322 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | acknowledging offline reports that the action is queued | Behaved as expected | Pass |
| UT-C323 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | a rejected acknowledgement (409) shows the server message | Behaved as expected | Pass |
| UT-C324 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | an ACKNOWLEDGED alert offers a response form (not Resolve); a saved response moves it to RESPONDING | Behaved as expected | Pass |
| UT-C325 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | saving a response offline, or saving and resolving, shows the matching confirmation | Behaved as expected | Pass |
| UT-C326 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | resolving a RESPONDING alert requires notes and then records the resolution | Behaved as expected | Pass |
| UT-C327 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | too-short resolution notes are refused before any request | Behaved as expected | Pass |
| UT-C328 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | a RESOLVED alert is read-only: no lifecycle, edit, cancel or response edit controls | Behaved as expected | Pass |
| UT-C329 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | a CANCELLED alert says no further lifecycle actions are allowed | Behaved as expected | Pass |
| UT-C330 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | editing the alert sends the new description and severity | Behaved as expected | Pass |
| UT-C331 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | cancelling the alert sends the reason and shows the CANCELLED state | Behaved as expected | Pass |
| UT-C332 | UC-C | Client · pages › ConflictAlertDetailPage | Negative | a rejected cancel shows the server message | Behaved as expected | Pass |
| UT-C333 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | deleting the alert after confirmation reports the soft delete | Behaved as expected | Pass |
| UT-C334 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | a response can be edited and deleted from the history timeline | Behaved as expected | Pass |
| UT-C335 | UC-C | Client · pages › ConflictAlertDetailPage | Positive | audit entries such as UPDATE and CANCEL appear in the history with their reason | Behaved as expected | Pass |
| UT-C336 | UC-C | Client · components › ConflictAlertCard | Positive | an active alert offers Edit and Delete; Delete passes the alert to the handler | Behaved as expected | Pass |
| UT-C337 | UC-C | Client · components › ConflictAlertCard | Negative | a RESOLVED alert is read-only (no Edit or Delete) | Behaved as expected | Pass |
| UT-C338 | UC-C | Client · components › ConflictAlertCard | Negative | a CANCELLED alert is read-only (no Edit or Delete) | Behaved as expected | Pass |
| UT-C339 | UC-C | Client · components › ConflictAlertCard | Positive | sync status, response count and unnamed sources are shown | Behaved as expected | Pass |
| UT-C340 | UC-C | Client · components › ConflictResponseForm | Edge | submits the chosen action, trimmed notes and outcome; an empty outcome is omitted | Behaved as expected | Pass |
| UT-C341 | UC-C | Client · components › ConflictResponseForm | Edge | notes of exactly 3 characters are accepted; 2 are refused | Behaved as expected | Pass |
| UT-C342 | UC-C | Client · components › ConflictResponseForm | Negative | a rejected submission (e.g. 409 from the server) is shown in the form | Behaved as expected | Pass |
| UT-C343 | UC-C | Client · components › ConflictResponseForm | Positive | Cancel calls back, and every control is disabled while submitting | Behaved as expected | Pass |
| UT-C344 | UC-C | Client · components › ResponseHistoryTimeline | Positive | counts creation, acknowledgement, responses, resolution and non-lifecycle audit events | Behaved as expected | Pass |
| UT-C345 | UC-C | Client · components › CommunityReportModal | Edge | sends the edited location, type, severity and description; a blank reporter becomes "Community Member" | Behaved as expected | Pass |
| UT-C346 | UC-C | Client · components › CommunityReportModal | Error | an error without a message falls back to a generic report error and the modal stays open | Behaved as expected | Pass |
| UT-C347 | UC-C | Client · components › CollarSimulatorModal used on its own (collar monitoring page) | Positive | sends the reading through the conflict-alert API and closes | Behaved as expected | Pass |
| UT-C348 | UC-C | Client · components › CollarSimulatorModal used on its own (collar monitoring page) | Edge | regression: negative coordinates can be typed from an empty field (minus sign is not lost) | Behaved as expected | Pass |
| UT-C349 | UC-C | Client · components › CollarSimulatorModal used on its own (collar monitoring page) | Error | an API failure is displayed, the modal stays open and the button is usable again | Behaved as expected | Pass |
| UT-C350 | UC-C | Client · components › CollarSimulatorModal used on its own (collar monitoring page) | Error | an error without a message falls back to a generic simulator error | Behaved as expected | Pass |
| UT-C351 | UC-C | Client · collars › collarApi | Positive | getCollarDevices returns the device list and stats from one request | Behaved as expected | Pass |
| UT-C352 | UC-C | Client · collars › collarApi | Positive | getCollarTelemetryHistory URL-encodes the device id | Behaved as expected | Pass |
| UT-C353 | UC-C | Client · collars › collarApi | Positive | ingestCollarLocation sends the reading with the gateway key header | Behaved as expected | Pass |
| UT-C354 | UC-C | Client · collars › collarApi | Negative | a rejected gateway key (401) propagates to the caller | Behaved as expected | Pass |
| UT-C355 | UC-C | Client · collars › CollarMonitoringPage | Positive | shows loading, then the KPI stats and one row per collar with its risk-zone state | Behaved as expected | Pass |
| UT-C356 | UC-C | Client · collars › CollarMonitoringPage | Positive | search by collar or animal id and the status filters narrow the table | Behaved as expected | Pass |
| UT-C357 | UC-C | Client · collars › CollarMonitoringPage | Edge | a filter with no matches and an empty registry show different empty states | Behaved as expected | Pass |
| UT-C358 | UC-C | Client · collars › CollarMonitoringPage | Error | a load failure shows the error | Behaved as expected | Pass |
| UT-C359 | UC-C | Client · collars › CollarMonitoringPage | Positive | the telemetry log opens for a collar and shows which readings generated alerts | Behaved as expected | Pass |
| UT-C360 | UC-C | Client · collars › CollarMonitoringPage | Error | a telemetry log failure still opens the log, empty | Behaved as expected | Pass |
| UT-C361 | UC-C | Client · collars › CollarMonitoringPage | Positive | the collar simulator sends a reading and the device list is reloaded when it closes | Behaved as expected | Pass |
| UT-C362 | UC-C | Client · collars › CollarTelemetryHistoryModal | Positive | shows a loading message, then the reading count and coordinates | Behaved as expected | Pass |
| UT-C363 | UC-C | Client · collars › CollarTelemetryHistoryModal | Positive | clicking the backdrop closes it; clicking inside does not | Behaved as expected | Pass |
| UT-C364 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | AlertSeverityBadge renders all severities correctly | Behaved as expected | Pass |
| UT-C365 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | AlertStatusBadge renders all statuses correctly | Behaved as expected | Pass |
| UT-C366 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ConflictAlertCard renders collar alert, urgent borders, and pending status | Behaved as expected | Pass |
| UT-C367 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ConflictAlertCard renders community reporter name and PENDING SYNC badge | Behaved as expected | Pass |
| UT-C368 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Negative | ConflictAlertMap handles valid location and shows fallback on invalid coordinates | Behaved as expected | Pass |
| UT-C369 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ResponseHistoryTimeline renders complete audit history including actions and outcomes | Behaved as expected | Pass |
| UT-C370 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Negative | ConflictResponseForm validates notes and resolution notes when markResolved checked | Behaved as expected | Pass |
| UT-C371 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | CollarSimulatorModal submits configured animal and coordinates | Behaved as expected | Pass |
| UT-C372 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | CommunityReportModal submits reporter name and details | Behaved as expected | Pass |
| UT-C373 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ConflictAlertsPage renders active alerts, filters, and modal controls | Behaved as expected | Pass |
| UT-C374 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ConflictAlertDetailPage handles OPEN alert acknowledgement and updates status | Behaved as expected | Pass |
| UT-C375 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Negative | ConflictAlertDetailPage restricts direct resolve when ACKNOWLEDGED without prior response | Behaved as expected | Pass |
| UT-C376 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Positive | ConflictAlertDetailPage allows resolve when RESPONDING with notes | Behaved as expected | Pass |
| UT-C377 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Error | conflictAlertApi.acknowledgeAlert handles offline network error with Dexie PENDING update | Behaved as expected | Pass |
| UT-C378 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Error | conflictAlertApi.addResponse handles offline network error with Dexie PENDING update and stable clientResponseId | Behaved as expected | Pass |
| UT-C379 | UC-C | Client · existing UC-C tests › UC-C Wildlife Conflict Alerts & Response Comprehensive Frontend Tests | Error | conflictAlertApi.resolveAlert handles offline network error with Dexie PENDING update and stable clientActionId | Behaved as expected | Pass |
