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
