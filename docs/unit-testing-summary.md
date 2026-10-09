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
