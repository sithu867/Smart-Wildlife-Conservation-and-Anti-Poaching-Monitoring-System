# Unit Testing

## Testing Approach

The server was unit tested with Jest and ts-jest. Supertest was used to call the Express routes, controllers and the shared error handler over HTTP without starting a server. Prisma was replaced by in-memory mocks, so every server unit test runs in isolation with no dependency on the live Neon PostgreSQL database. A setup file points `DATABASE_URL` at an unreachable address, so a query that is not mocked fails instead of reaching Neon. The client was tested with Vitest and React Testing Library. HTTP calls were mocked, while the Dexie offline database ran for real on `fake-indexeddb`, so offline saving, the sync queue and synchronisation were checked against actual IndexedDB contents. Test cases were designed as Positive (valid input), Negative (invalid input or a forbidden action), Edge (boundaries, empty data, repeated or concurrent actions) and Error (database, network or service failures). For the offline-capable use cases (UC-A, UC-B, UC-C), tests also verify that only a request with no response switches to offline mode, that queued actions reach SYNCED after reconnecting, and that a failed synchronisation never deletes local data. Database-backed integration tests exist separately and were not part of these unit runs.

## Coverage Summary

Line, statement, branch and function coverage from the final run. Server figures are Jest (unit suites only); client figures are Vitest V8.

| Area | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| UC-A Manage Ranger Patrols – server (`modules/patrols`) | 100% | 85.86% | 100% | 100% |
| UC-A Manage Ranger Patrols – client (`features/patrols`) | 95.65% | 88.22% | 91.95% | 95.65% |
| UC-B Conservation Incidents – server (`modules/incidents`) | 99.44% | 92.97% | 100% | 100% |
| UC-B Conservation Incidents – client (`features/incidents`) | 92.99% | 89.91% | 83.33% | 92.99% |
| UC-C Conflict Alerts – server (`modules/conflict-alerts`) | 99.66% | 94.41% | 100% | 100% |
| UC-C Collar Ingestion – server (`modules/collar-ingestion`) | 100% | 93.28% | 100% | 100% |
| UC-C Conflict Alerts – client (`features/conflict-alerts`) | 92.53% | 87.22% | 87.04% | 92.53% |
| UC-C Collars – client (`features/collars`) | 91.49% | 83.33% | 85.71% | 91.49% |
| UC-D Analytics – server (`modules/analytics`) | 99.04% | 95.80% | 99.17% | 99.56% |
| UC-D Analytics – client (`features/analytics`) | 98.01% | 91.92% | 96.00% | 98.01% |
| Shared offline/sync – client (`src/offline`) | 98.57% | 95.83% | 92.31% | 98.57% |
| Shared error handler – server (`middleware`) | 100% | 95.24% | 100% | 100% |
| **Client Overall** | **94.65%** | **89.35%** | **88.81%** | **94.65%** |
| **Server Overall** | **99.43%** | **94.01%** | **99.29%** | **99.76%** |

## Representative Test Cases

Selected from the full tables in `docs/unit-testing-summary.md` (1,555 documented rows).

| Test ID | Use Case | Scenario | Type | Expected Result | Status |
|---|---|---|---|---|---|
| UT-A038 | UC-A | Start a second patrol while one is ACTIVE or PAUSED | Negative | Start is rejected | Pass |
| UT-A042 | UC-A | Record a GPS waypoint | Positive | Waypoint stored; distance and duration recalculated | Pass |
| UT-A047 | UC-A | Waypoint with latitude 90.5 | Negative | Rejected before any database access | Pass |
| UT-A063 | UC-A | Complete a patrol with no waypoints | Edge | Distance recorded as zero | Pass |
| UT-A069 | UC-A | Complete a CANCELLED patrol | Negative | Rejected (regression for a fixed defect) | Pass |
| UT-A160 | UC-A | Reconnect after an offline patrol | Positive | Complete patrol uploaded; every waypoint kept locally | Pass |
| UT-A259 | UC-A | Start GPS tracking without a Geolocation API | Error | Reported as an error instead of crashing | Pass |
| UT-B010 | UC-B | Evidence photo of exactly 5 MB, and 1 byte more | Edge | 5 MB accepted; larger rejected | Pass |
| UT-B026 | UC-B | Report submitted without evidence | Negative | Rejected with a validation error | Pass |
| UT-B053 | UC-B | Offline report synchronised later | Positive | Original device report time is kept | Pass |
| UT-B062 | UC-B | Offline sync retried after success | Edge | Existing report returned; no duplicate | Pass |
| UT-B083 | UC-B | Edit a standalone report at exactly 24 hours, and after | Edge | Allowed at 24 h; rejected after | Pass |
| UT-B147 | UC-B | Server answers 409 EDIT_CONFLICT | Negative | Message shown; nothing saved offline | Pass |
| UT-B171 | UC-B | PENDING report, reconnect, server accepts | Positive | Device copy and queue item become SYNCED | Pass |
| UT-B173 | UC-B | Server rejects an offline report during sync | Error | Queue item FAILED; report kept | Pass |
| UT-C051 | UC-C | Collar reading inside a risk zone | Positive | OPEN COLLAR alert with animal, location and time | Pass |
| UT-C196 | UC-C | Collar reading outside every zone | Positive | Stored as tracking data only; no alert | Pass |
| UT-C066 | UC-C | Reading 4.99 km and 5.01 km from a 5 km zone | Edge | Alert inside; none outside | Pass |
| UT-C074 | UC-C | Risk-zone calculation throws | Error | Error propagates; no false alert | Pass |
| UT-C076 | UC-C | Community report submitted | Positive | OPEN COMMUNITY_REPORT alert with manual location | Pass |
| UT-C142 | UC-C | Invalid lifecycle transition | Negative | HTTP 409 with transition message and code | Pass |
| UT-C275 | UC-C | Acknowledge while offline | Error | Device copy ACKNOWLEDGED + PENDING; one action queued | Pass |
| UT-C299 | UC-C | Server rejects a queued field action | Error | Item FAILED; local alert and response kept | Pass |
| UT-D003 | UC-D | Valid analysis criteria | Positive | Accepted; duplicate categories removed | Pass |
| UT-D004 | UC-D | Start date after end date | Negative | Rejected by the server | Pass |
| UT-D044 | UC-D | No records match the criteria | Edge | Successful no-data result, not an error | Pass |
| UT-D045 | UC-D | Data retrieval fails | Error | Generic message; distinguished from no-data | Pass |
| UT-D054 | UC-D | Hotspot grouping | Positive | Nearby points grouped, ranked by count | Pass |
| UT-D091 | UC-D | Patrol coverage | Positive | Routes classified completed/active/neglected; percentage calculated | Pass |
| UT-D224 | UC-D | Saved report with forged findings | Negative | Rejected before saving | Pass |
| UT-D283 | UC-D | CSV/XLSX export with commas, quotes and formulas | Edge | Values quoted; formulas neutralised | Pass |
| UT-S017 | Shared | Synchronisation fails | Error | Queued action and local record never deleted | Pass |
| UT-S021 | Shared | Action queued during a running sync | Edge | Sent in the same session (regression for a fixed defect) | Pass |
| UT-S028 | Shared | Sync answered with HTTP 400 | Negative | Item FAILED, not treated as offline | Pass |
| UT-S035 | Shared | Sync answered with HTTP 500 | Error | Item kept PENDING for automatic retry | Pass |
| UT-S085 | Shared | Unexpected error "database password xyz" | Error | Generic 500; internal message not returned | Pass |

## Final Execution Summary

| Item | Result |
|---|---|
| Client test files | 33 |
| Client tests | 744 passed / 744 |
| Server suites | 27 (unit only) |
| Server tests | 805 passed / 805 |
| Failed tests | 0 |
| Client coverage | 94.65% statements, 89.35% branches, 88.81% functions, 94.65% lines |
| Server coverage | 99.43% statements, 94.01% branches, 99.29% functions, 99.76% lines |
| Build | Passed (`npm run build`, client and server) |
| Type-check | Passed (`npm run typecheck --workspace server`; client checked by `tsc -b` in the build) |
| Lint | Passed (`npm run lint`, client and server) |

## Testing Evidence

Coverage HTML reports (generated locally; `coverage/` is git-ignored):

- Client: `client/coverage/index.html`
- Server: `server/coverage/index.html` (also `server/coverage/lcov-report/index.html`)

Commands to rerun for screenshots, from the repository root:

| Purpose | Command |
|---|---|
| Client tests with coverage table | `npm run test:coverage --workspace client` |
| Server type-check, tests and coverage table | `npm run test:coverage --workspace server` |
| Both suites with coverage | `npm run test:coverage` |
| One use case only (example, UC-C server) | `cd server && node --experimental-vm-modules ../node_modules/jest/bin/jest.js conflictAlert collarIngestion --coverage` |
| One use case only (example, UC-C client) | `cd client && npx vitest run src/features/conflict-alerts src/features/collars --coverage` |
| Build, type-check and lint | `npm run build` and `npm run lint` |

## Known Limitations

- Database-backed integration tests (`server/tests/integration`) were not run, because they need a separate test database. Some of their expectations were updated to the corrected status codes without being run.
- The client's live-update `EventSource` stream and real Leaflet map rendering are not available in jsdom. The server stream is tested, and maps are checked through their data and fallbacks.
- PDF reports are checked for headers, text content and layout limits, not visually.
- There is no animal registry, so unknown animal IDs in collar readings are accepted and not tested as rejected.
- In the patrol client (UC-A), a server rejection while online is still treated like lost connectivity and saved locally. The incident and conflict-alert clients distinguish the two.
- A transport error that is not an HTTP error is treated like a lost connection by the sync queue and retried. FAILED queue items are also resent on later sync runs, not only by Retry.
