UC-D Batch 2 implementation report — 7 October 2026

Park-scoped analysis is implemented for the four existing categories. The additive migration was applied to the configured Neon database. Batch 1 CUID validation, park existence checking, Prisma queries, patrolRouteId mapping, and report-preview foundations remain in place. No commit or push was performed.

1. **Root causes found**

   `Park -> PatrolRoute -> PatrolSession -> Waypoint` is the real relationship. Routes store `parkId`; sessions store `patrolRouteId`; waypoints store `patrolSessionId` and individual timestamps/coordinates. Route geometry is Prisma JSON containing GeoJSON LineStrings.

   `ConservationIncident` had only an optional `patrolSessionId`. Analytics correctly restricted incidents to the selected park's session IDs, but standalone reports had no field through which to establish park membership. Incident locations are JSON; they are not park relationships.

   `WildlifeConflictAlert -> ConflictResponse` was correctly linked through `alertId`, but alerts had no park reference. Existing UC-D queries therefore deliberately returned all parks/unassigned alerts, with an unscoped notice. Collar risk zones and animal IDs do not reference parks. Community reports also lack any independently derivable park context. Parks have no boundary geometry.

   Live verification additionally found historical `CANCELLED` patrol sessions, outside the current Prisma `PatrolStatus` enum. Retrieving those rows caused Prisma P2023 and interrupted analysis. One completed historical session also has its end before its start; existing defensive completion logic correctly rejects it as an in-period completion.

2. **Design decisions**

   Patrol-linked incidents use their session's route park as the authoritative association. Creation also stores that park explicitly, retaining scope if the optional session link is later set null. An explicitly supplied conflicting park is rejected. The query's explicit-park fallback applies only to standalone incidents, so a conflicting direct value cannot override another park's patrol link.

   Standalone incident reporting now offers one optional park selector. Existing clients may still omit it. Supplied IDs must match the current CUID contract and reference an existing park. Offline incident payloads retain this field through the existing sync transport.

   Direct/API alerts, collar simulator events, and community reports accept an optional validated `parkId`. The two existing conflict forms expose the same optional selector. No park is inferred from coordinates, animal IDs, or risk-zone names. Automatically generated collar event keys include an explicit park context when present, preventing a previous unassigned event from swallowing a new assignment. Explicit upstream event IDs and same-park retries remain idempotent.

   Unassigned incidents, alerts, and responses remain in their original workflows. Analytics excludes them from every park. Only incident associations proven by the stored session/route link were backfilled. Legacy alerts have no reliable association and were left null.

   Conflict location analysis uses the existing 0.01-degree grid convention, about 1.1 km north-south. Longitude width varies with latitude. Cells are never merged. Each occupied cell, including a single alert, reports frequency, mean recorded coordinates, severity/type counts, and rank. Rank uses descending count, coordinates, then cell ID. Invalid coordinates remain in alert totals but are excluded from spatial results. Stable summation order and boundary normalization make grouping reproducible. This measures frequency, not predicted risk or exact land area.

3. **Files changed**

   The complete per-file inventory and purpose table appears below in section 11. It includes every modified and untracked deliverable.

4. **Database / Prisma changes**

   `ConservationIncident.parkId` and `WildlifeConflictAlert.parkId` are nullable foreign keys to `Park`, with reciprocal collections on `Park`. Composite indexes cover `(parkId, reportedAt)` and `(parkId, createdAt)`. Park deletion uses `SET NULL`; existing records are retained.

   Migration `20261007000000_conservation_park_scope` adds these columns, indexes, and constraints, and backfills incidents only through `incident -> session -> route -> park`. The migration is wrapped in a transaction. It applied successfully using `npm.cmd run db:deploy --workspace server`. No reset, drop, deletion, fabricated record, or destructive migration was performed.

   The database also records teammate migration `20261006143714_uc03_crud_audit`, which is absent locally. Its history and schema were preserved; this task applied only the new additive migration. The missing source migration still needs recovery from the teammate before future schema reconciliation.

   The read-only inventory confirmed 11 incidents remain: two associated and nine unassigned; all 21 existing conflict alerts and their 12 responses remain unassigned. No conflict alert was backfilled. An earlier progress estimate of 23 alerts was corrected by summing the grouped inventory: the actual total is 21.

5. **Analytics fixes**

   Incident statistics and hotspots share one park/date/filter query. Type, status, and reporter filters narrow that query. Incident dates use `reportedAt`, independently of when the linked patrol started. Existing totals, type/status breakdowns, and time series are preserved.

   Hotspots retain the fixed grid, two-incident minimum, mean positions, concentration thresholds, and type breakdown. Invalid coordinates and insufficient cell counts yield valid empty spatial results. A cell-ID tie break fixes ranks when adjacent cells round to identical representative coordinates.

   Patrol coverage still uses selected-park routes, real session foreign keys, and in-period starts, completions, and valid waypoints. Sessions and waypoints are deduplicated. Waypoints remain constrained to the date range and session lifecycle. Unsupported historical lifecycle states are excluded at the query boundary with a limitation notice; no patrol model or workflow was rewritten. All selected-park routes remain in the denominator. Coverage is completed routes / selected-park routes.

   HWC alert queries now require the selected `parkId`. Response retrieval uses the same parent park and filters, while applying the response date independently. Thus a response to an older alert can count, but another park's response cannot. Severity, current status, source, type, and acknowledging ranger remain supported. Location results use only the filtered alerts created in the selected period.

   All categories retain the shared inclusive UTC window: Start Date at 00:00:00.000Z through End Date at 23:59:59.999Z. Legacy summary patrol groups use the same qualified, deduplicated session set. Unsupported filter values still fail validation. Incident filters do not affect HWC or patrol categories; conflict filters do not affect incidents or patrols.

   Empty analysis renders an informational notice plus selected category zero/empty results. Incidents with no threshold hotspot still render statistics. Alerts with no responses render zero responses. Routes with no activity remain useful neglected-route findings. Applied scope no longer claims HWC is global and includes all supported optional filters. Draft edits and failed refreshes retain the existing applied-scope/results behavior.

6. **Team-member safety**

   The incident service/validation, incident payload types/API, and incident reporting page changed only to establish and retain explicit park context. Existing evidence requirements, ownership checks, duplicate handling, submission process, and read APIs remain intact. The sync transport change copies the new field; the offline database and sync engine were not changed.

   Conflict service/validation, conflict input types, and the collar/community modals changed only to capture, validate, forward, and retain park context and distinguish automatically generated simulator keys by that context. Risk detection, severity rules, listing, detail, acknowledgement, response history, and resolution behavior were preserved. The modal bodies now scroll on small screens to accommodate the extra field.

   The shared selector and validator support these necessary integration points. Schema changes touch only Park and the two conservation record models. No patrol workflow, authentication, notification implementation, manager dashboard, or unrelated PWA feature was changed. Existing report files received only scope/contract compatibility changes and location findings; no report CRUD/history/export redesign was implemented.

   New Prisma-mocked HTTP workflow tests cover standalone/patrol incident creation, conflicting/invalid parks, evidence compatibility, incident retry behavior, direct/collar/community alerts with and without parks, telemetry-only collar behavior, same-park idempotency, park-specific generated simulator keys, and the existing alert lifecycle. New frontend tests cover explicit park capture, lookup failure/retry, real Leaflet location rendering, and retention through incident sync.

7. **Comments and code quality**

   Comments explain authoritative patrol membership, safe nullable migration/backfill, legacy exclusions, independent response dates, unsupported historical patrol states, deduplication, JSON coordinate defenses, fixed grid boundaries, rank ties, and simulator idempotency. The existing inclusive UTC and route-based coverage comments were retained.

   The dependency-free shared analytics contract now includes typed conflict-location results. Calculations remain pure. Shared grouping and coordinate utilities avoid duplicate logic. Controllers remain thin and unchanged. Incident return shaping now uses Prisma's projected payload type instead of `any`; the new implementation adds no `any`. Existing unrelated teammate casts were not broadly refactored. Strict snapshot validation accepts the new park scope and verifies spatial count consistency.

8. **Tests actually run**

   Final relevant backend command, run from the repository root:

   ```powershell
   npm.cmd run test --workspace server -- --runTestsByPath tests/analytics.test.ts tests/analyticsBatch2.test.ts tests/analyticsCalculations.test.ts tests/patrolCoverage.test.ts tests/conservationReport.test.ts tests/parkScopedAnalysis.test.ts tests/parkAssociationWorkflows.test.ts
   ```

   Result: **PASS — seven suites, 157 tests**. Prisma is mocked at the database boundary; mixed-park fixtures evaluate the actual where predicates rather than returning fixed rows. Batch 1 patrolRouteId coverage and report-preview regressions pass.

   Final focused frontend command:

   ```powershell
   npm.cmd run test --workspace client -- src/features/analytics src/features/incidents src/features/patrols
   ```

   Result: **PASS — seven files, 94 tests**, including 77 analytics tests and the existing incident/patrol suites.

   Complete frontend suite:

   ```powershell
   npm.cmd run test --workspace client -- --reporter=json --outputFile=../.tmp/ucd-verification/final-client-results.json
   ```

   Result: **FAIL — 110 passed, three failed, 113 total**. The same three failures were reproduced against an isolated archive of unchanged HEAD using `npm run test --workspace client -- src/App.test.tsx src/features/conflict-alerts/ConflictAlerts.test.tsx` from that archive. They were not hidden or skipped:

   - `renders ranger and manager route pages`: expects the old exact text `Analytics`; the current page says `Analytics & Reports`.
   - `CollarSimulatorModal submits configured animal and coordinates`: expects `Generate Collar Conflict Alert`; the existing button says `Generate Collar Alert`.
   - `ConflictAlertDetailPage restricts direct resolve when ACKNOWLEDGED without prior response`: its `getByText` assertion assumes text not split across the existing nested status span.

   These unrelated assertions were left unchanged. The new collar submission test uses the actual accessible button and passes. The full backend suite was not run because existing unrelated endpoint suites use the configured database and can create real records; focused mocked tests provide this batch's verification without populating production data.

   Other completed checks:

   | Exact command | Result |
   | --- | --- |
   | `npm run db:generate --workspace server` | PASS; Prisma Client generated |
   | `npm.cmd run build` | PASS; client TypeScript/Vite/PWA and server TypeScript |
   | `npm.cmd run build --workspace server` | PASS after final spatial tie-break changes |
   | `node node_modules/typescript/bin/tsc --noEmit -p client/tsconfig.json` | PASS |
   | `node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json` | PASS |
   | `npm.cmd run lint` | PASS; both workspaces |
   | `npx.cmd prisma validate --schema prisma/schema.prisma` from `server` | PASS |
   | `git diff --check` | PASS |

   Initial sandboxed frontend tests/build could not load Vite/esbuild configuration. The successful runs used expanded file access. Build emits the existing large-bundle warning. Tests emit expected jsdom GPS/IndexedDB and existing React act warnings; these did not fail the focused suites. Temporary baseline copies and logs were removed after recording the results.

9. **Manual verification guide**

   Open `/manager/analytics` (Manager navigation), select **Serengeti Northern Sector (SERENGETI-NORTH)**, park ID `cmuwb1zsy0000z4u7tt95s0bn`, Start **2026-10-06**, End **2026-10-07**, all four categories, and clear advanced filters. Select Analyze / Update Analysis. The following were verified by calling the real analytics service against Neon during this task:

   | Category | Expected current result |
   | --- | --- |
   | Incident Statistics | Two incidents: ILLEGAL_CAMPSITE = 1, OTHER = 1; REPORTED = 2; October 6 = 2, October 7 = 0 |
   | Incident Hotspots | One LOW-concentration cell `683:7994`, two incidents, representative latitude 6.830082 / longitude 79.942192 |
   | Patrol Coverage | Three routes; two Covered, zero Limited Activity, one Neglected; 66.7%; 68 qualified sessions, 27 valid completed patrols |
   | HWC Trends | Zero assigned alerts, zero responses, empty location state; all 21 existing alerts and their 12 responses are unassigned |

   The two associated incidents are `cmuw1mw660004v4unbu8vybhz` (ILLEGAL_CAMPSITE) and `cmuw0b4q2000hgcunz1g2i2gm` (OTHER). An example excluded standalone SNARE incident is `cmuvzwulh0000gcunap77e1dr`. An example excluded conflict alert is `cmuw0k8y70000wounvee3st7r`.

   Covered routes are **Mara River Savanna Corridor** (one qualified session, one completion, five waypoints) and **Northern Boundary Patrol** (67 qualified sessions, 26 completions, 61 waypoints). **Rhino Sanctuary Perimeter Sweep** is Neglected. Example real patrol session `cmuw1mdvz0002v4unwd7qz2un` spans October 6–7. Historical reversed-lifecycle session `cmuxeog0d0000r8vkicapepvf` does not establish a valid completion.

   To check narrowing, select ILLEGAL_CAMPSITE: incident total becomes one and no incident cell meets the two-record hotspot threshold. Conflict and patrol filters remain independent. Select SNARE: assigned incident total is zero, although unassigned SNARE reports remain in the ranger workflow.

   To check meaningful zero activity, use **2026-09-01 through 2026-09-30** with Patrol Coverage selected: all three routes are Neglected, completed patrols and coverage are zero. This was also verified live. With only Incident Statistics/Hotspots/HWC selected for that period, use the valid no-source-data states.

   The configured database currently contains only one park and no assigned HWC alerts. A populated live Park A/Park B switch or conflict-location demonstration cannot honestly be supplied from these records. Automated mixed-park fixtures prove isolation, distinct results, old-alert/new-response behavior, filters, and locations without writing fabricated data. Future genuine alerts should capture their known park in the existing collar/community form or API. No legacy assignment should be invented merely to populate the view.

   Draft park/date/filter edits leave Applied Scope unchanged until a successful Analyze / Update Analysis. A failed refresh keeps the prior successful results. Verify this behavior at mobile/tablet/desktop widths; responsive grids, full-width controls, bounded Leaflet containers, and scrolling modals were preserved. No real-device browser visual audit was performed in this session.

   To repeat the read-only database checks from `server`:

   ```powershell
   node --import tsx scripts/analyticsInventory.ts
   node --import tsx scripts/analyticsInventory.ts --start=2026-10-06 --end=2026-10-07
   node --import tsx scripts/analyticsInventory.ts --start=2026-09-01 --end=2026-09-30
   ```

   Counts are a verification snapshot and can change when teammates add genuine records. Existing incident coordinates in the populated hotspot differ geographically from the route geometry; the analysis preserves the recorded coordinates and authoritative association, without relocating records or inferring a new park.

10. **Remaining limitations**

    Legacy/unassigned records require a separately verified administrative assignment if they are ever to contribute to a park's analytics. There is no automatic coordinate backfill or new assignment-management screen.

    HWC status/severity breakdowns reflect current saved values, not historical state reconstruction. Conflict Ranger ID continues to mean the parent's acknowledging ranger. Location analysis describes alerts created in the period, while response trends independently describe responses recorded in the period.

    Historical unsupported patrol lifecycle states are excluded; their records remain intact. Recovering the missing teammate migration and reconciling the database's broader historical lifecycle values is outside UC-D scope.

    Neglected-route analysis is displayed correctly, but existing report eligibility still requires matching activity records and may disable/refuse a report when only neglected routes exist. This is explicitly left for the later report batch, as requested.

    The three confirmed pre-existing frontend test failures and real-device visual verification remain outstanding. No report CRUD/history, CSV/Excel work, PDF redesign, authentication, unrelated notifications, or future batches were implemented.

11. **Git status and complete file inventory**

    `M` means modified tracked file; `??` means new untracked file. No files were staged, committed, or pushed. Generated build metadata was restored and temporary verification copies were removed. The table below records the final deliverables and the purpose of each change.

| Status | File | Why it changed |
| --- | --- | --- |
| `M` | [client/src/features/analytics/AnalysisCriteriaForm.tsx](../client/src/features/analytics/AnalysisCriteriaForm.tsx) | Replace the obsolete global HWC help text with truthful selected-park/filter guidance. |
| `M` | [client/src/features/analytics/AnalyticsResults.tsx](../client/src/features/analytics/AnalyticsResults.tsx) | Render category zero states, show all applied filters, and display accurate shared park scope. |
| `M` | [client/src/features/analytics/Batch2Results.test.tsx](../client/src/features/analytics/Batch2Results.test.tsx) | Update HWC scope and informational no-data expectations. |
| `M` | [client/src/features/analytics/Batch3Results.test.tsx](../client/src/features/analytics/Batch3Results.test.tsx) | Expect selected-park scope in combined coverage/results. |
| `M` | [client/src/features/analytics/Batch4Report.test.tsx](../client/src/features/analytics/Batch4Report.test.tsx) | Keep preview expectations compatible with the corrected conflict scope. |
| `M` | [client/src/features/analytics/CategoryResults.tsx](../client/src/features/analytics/CategoryResults.tsx) | Render conflict locations and truthful zero totals/response states. |
| `M` | [client/src/features/analytics/analyticsTestFixtures.ts](../client/src/features/analytics/analyticsTestFixtures.ts) | Model selected-park conflicts and the shared typed location section. |
| `M` | [client/src/features/conflict-alerts/components/CollarSimulatorModal.tsx](../client/src/features/conflict-alerts/components/CollarSimulatorModal.tsx) | **Integration:** add only optional park capture; preserve simulation submission and allow modal scrolling. |
| `M` | [client/src/features/conflict-alerts/components/CommunityReportModal.tsx](../client/src/features/conflict-alerts/components/CommunityReportModal.tsx) | **Integration:** add only optional park capture; preserve community submission and allow modal scrolling. |
| `M` | [client/src/features/conflict-alerts/types/conflictAlert.ts](../client/src/features/conflict-alerts/types/conflictAlert.ts) | **Integration:** type the optional alert/input park context. |
| `M` | [client/src/features/incidents/api/incidentApi.ts](../client/src/features/incidents/api/incidentApi.ts) | **Integration:** retain parkId in pending incident payloads and resend it through the existing sync transport. |
| `M` | [client/src/features/incidents/pages/ReportIncidentPage.tsx](../client/src/features/incidents/pages/ReportIncidentPage.tsx) | **Integration:** expose optional park selection for standalone reports; patrol-linked reports derive scope server-side. |
| `M` | [client/src/features/incidents/types/incident.ts](../client/src/features/incidents/types/incident.ts) | **Integration:** type explicit park associations in stored records and creation payloads. |
| `M` | [server/prisma/schema.prisma](../server/prisma/schema.prisma) | **Shared data model:** nullable incident/alert Park relations, reciprocal collections, and scoped-date indexes. |
| `M` | [server/src/modules/analytics/calculations.ts](../server/src/modules/analytics/calculations.ts) | Return selected-park HWC/location calculations and reuse shared grouping. |
| `M` | [server/src/modules/analytics/contract.ts](../server/src/modules/analytics/contract.ts) | Share typed park-scoped HWC/location results and accurate scope notices. |
| `M` | [server/src/modules/analytics/criteriaService.ts](../server/src/modules/analytics/criteriaService.ts) | Scope incidents/alerts/responses, preserve date semantics, deduplicate summary sessions, and guard unsupported patrol states. |
| `M` | [server/src/modules/analytics/hotspots.ts](../server/src/modules/analytics/hotspots.ts) | Reuse safe coordinate/grid utilities and make rounded-coordinate ranking ties deterministic; preserve the algorithm. |
| `M` | [server/src/modules/analytics/legacyReportPdf.ts](../server/src/modules/analytics/legacyReportPdf.ts) | Correct the conflict scope label for existing scoped PDF callers. |
| `M` | [server/src/modules/analytics/patrolCoverage.ts](../server/src/modules/analytics/patrolCoverage.ts) | Deduplicate waypoints while retaining route membership, lifecycle, geometry, and activity rules. |
| `M` | [server/src/modules/analytics/reportContract.ts](../server/src/modules/analytics/reportContract.ts) | Keep the existing preview/document compatible with the new scope and location frequencies. |
| `M` | [server/src/modules/analytics/reportValidation.ts](../server/src/modules/analytics/reportValidation.ts) | Validate selected-park HWC snapshots, new location fields, and their count consistency. |
| `M` | [server/src/modules/conflict-alerts/service.ts](../server/src/modules/conflict-alerts/service.ts) | **Integration:** validate/store/forward explicit park context and scope generated simulator keys; preserve lifecycle methods. |
| `M` | [server/src/modules/conflict-alerts/validation.ts](../server/src/modules/conflict-alerts/validation.ts) | **Integration:** accept optional CUID-compatible park context for all three alert creation inputs. |
| `M` | [server/src/modules/incidents/service.ts](../server/src/modules/incidents/service.ts) | **Integration:** derive patrol park, reject conflicting/invalid assignments, store standalone context, and retain typed existing response shape. |
| `M` | [server/src/modules/incidents/validation.ts](../server/src/modules/incidents/validation.ts) | **Integration:** accept optional validated park context without changing evidence/report requirements. |
| `M` | [server/tests/analytics.test.ts](../server/tests/analytics.test.ts) | Keep scope/query contracts and Batch 1 regression expectations current. |
| `M` | [server/tests/analyticsBatch2.test.ts](../server/tests/analyticsBatch2.test.ts) | Assert explicit standalone incident fallback and selected-park alert/response queries. |
| `M` | [server/tests/analyticsCalculations.test.ts](../server/tests/analyticsCalculations.test.ts) | Expect selected-park HWC metadata while preserving existing calculation tests. |
| `M` | [server/tests/analyticsPrismaMock.ts](../server/tests/analyticsPrismaMock.ts) | Add typed optional alert-location projections at the Prisma read boundary. |
| `M` | [server/tests/conservationReport.test.ts](../server/tests/conservationReport.test.ts) | Keep existing report snapshots/PDF tests compatible with corrected category scope. |
| `M` | [server/tests/patrolCoverage.test.ts](../server/tests/patrolCoverage.test.ts) | Verify supported lifecycle retrieval while retaining existing patrolRouteId and coverage regressions. |
| `??` | [client/src/features/analytics/ConflictLocationResults.tsx](../client/src/features/analytics/ConflictLocationResults.tsx) | Add the bounded Leaflet map, ranked frequencies, and coordinate exclusions. |
| `??` | [client/src/features/analytics/ParkScopedResults.test.tsx](../client/src/features/analytics/ParkScopedResults.test.tsx) | Test real location rendering, zero states, capture forms, lookup retry, and park retention through sync. |
| `??` | [client/src/shared/components/OptionalParkSelect.tsx](../client/src/shared/components/OptionalParkSelect.tsx) | **Integration:** reusable optional central-park selector with abort-safe loading and retry; no separate workflow. |
| `??` | [docs/UC-D-BATCH2-REPORT.md](../docs/UC-D-BATCH2-REPORT.md) | Document all requested findings, decisions, changed files, safety, tests, real records, and limitations. |
| `??` | [server/prisma/migrations/20261007000000_conservation_park_scope/migration.sql](../server/prisma/migrations/20261007000000_conservation_park_scope/migration.sql) | **Shared data model:** transactional additive migration and trustworthy session/route incident backfill only. |
| `??` | [server/scripts/analyticsInventory.ts](../server/scripts/analyticsInventory.ts) | Add repeatable SELECT-only record inventory and optional real analytics verification. |
| `??` | [server/src/modules/analytics/conflictLocations.ts](../server/src/modules/analytics/conflictLocations.ts) | Add pure deterministic conflict location frequencies and ranking. |
| `??` | [server/src/modules/analytics/grouping.ts](../server/src/modules/analytics/grouping.ts) | Reuse one existing group-count algorithm without creating a calculation import cycle. |
| `??` | [server/src/modules/analytics/spatial.ts](../server/src/modules/analytics/spatial.ts) | Share defensive JSON coordinate validation and decimal-grid boundary normalization. |
| `??` | [server/src/modules/shared/parkScope.ts](../server/src/modules/shared/parkScope.ts) | **Integration:** share optional CUID validation, park existence checking, and friendly validation errors. |
| `??` | [server/tests/parkAssociationWorkflows.test.ts](../server/tests/parkAssociationWorkflows.test.ts) | **Integration tests:** exercise existing incident/alert HTTP workflows and new association/idempotency rules with Prisma mocks. |
| `??` | [server/tests/parkScopedAnalysis.test.ts](../server/tests/parkScopedAnalysis.test.ts) | Test actual where predicates against mixed parks, dates, filters, responses, waypoints, legacy rows, and deterministic cells. |

Total: 32 modified tracked files and 12 new untracked files.
