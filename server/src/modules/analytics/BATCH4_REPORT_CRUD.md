# Batch 4 — StatisticalReport CRUD and integrity

Implemented and verified on 7 October 2026. No commit or push was performed.

## 1. Previous CRUD gap

The former POST /api/analytics/reports accepted a client-built analytical snapshot, structurally checked it, and returned it without persistence. PDF export accepted that snapshot again. There was no database report ID, saved history, saved detail, metadata UPDATE, or DELETE/archive. Consistent fabricated findings could therefore pass structural validation.

## 2. Database design

`server/prisma/schema.prisma` now defines `StatisticalReport`:

| Field | Purpose |
| --- | --- |
| id | Prisma-generated CUID primary key |
| title, notes | Editable metadata; notes nullable |
| parkId, park | Required Park foreign key, ON DELETE RESTRICT |
| startDate, endDate | Applied inclusive calendar period, PostgreSQL DATE |
| criteria | JSONB containing validated park, dates, categories and every applied filter |
| snapshot | JSONB containing generatedAt, original park labels, appliedCriteria, selectedCategories and complete analyticsResult, including category findings, route geometry, availability and scope/limitations |
| generatedAt | Server-issued snapshot generation timestamp |
| createdAt, updatedAt | Persistence and metadata/archive timestamps |
| archivedAt | Nullable soft-delete timestamp |
| creatorId | Nullable identifier, deliberately null with the current access architecture |
| version | Starts at 1; regeneration increments the parent version |
| parentReportId, parentReport, nextVersions | Self-relation retaining the previous version |

There is no authenticated User/Manager entity. The existing MANAGER role header cannot establish an individual creator. No fake manager foreign key, client-supplied creator, or ownership guarantee was added.

Indexes support active history ordering and park lookup. A unique `(parentReportId, version)` constraint prevents concurrent requests from creating duplicate successors. Multiple independent version-1 reports are supported.

## 3. Migration and safety

Migration: `server/prisma/migrations/20261007010000_statistical_reports/migration.sql`.

The migration creates only StatisticalReport, its primary key, one unique index, two lookup indexes, and Park/self foreign keys. The only edit to an existing model is Park.statisticalReports, the inverse Prisma relation. It contains no existing-table DROP, data DELETE, reset, or source-record rewrite.

Commands, executed from server:

```powershell
npx prisma validate --config prisma.config.ts
npx prisma generate --config prisma.config.ts
npx prisma migrate status --config prisma.config.ts
npx prisma migrate deploy --config prisma.config.ts
```

Validation and client generation passed. The migration was successfully APPLIED to Neon using migrate deploy. Deployment reported all local migrations applied. The preceding status check disclosed an already-applied teammate migration absent locally, `20261006143714_uc03_crud_audit`; it was left untouched. Restricted-network execution initially produced a generic schema-engine connection error; the permitted network run succeeded. No database reset or destructive migration command ran.

## 4. CREATE

`POST /api/analytics/reports` accepts `{ criteria, title?, notes? }`, returning 201 with the saved report and real ID.

The controller validates a strict Zod request. The service calls the existing analyticsService.getAnalytics, which validates the selected Park and performs authoritative park/date/category/filter-scoped analytics. It checks meaningful matching conservation activity, builds and validates the server-issued snapshot, and persists the criteria plus complete findings through Prisma. No calculation logic was duplicated.

Dates, date ordering, required park, CUID/UUID-compatible IDs, nonempty categories, enums and filters reuse existing UC-D validation. Empty optional form controls normalize to the existing all-records meaning. Titles trim to 1–200 characters; notes trim to at most 5000 characters and may be null. Unsupported body/criteria keys fail validation. No-data report generation remains unavailable, including route-only findings without matching patrol activity, consistent with the preceding report behavior.

The UI now says Generate & Save Report. Draft criteria do not replace Applied Scope. The server recomputes at saving time; the manager previews exactly the persisted server result, even if sources changed after Analyze. Failures preserve the reviewed analysis and offer retry.

## 5. READ history and detail

`GET /api/analytics/reports?cursor=<optional-report-id>` returns `{ items, nextCursor }`. Active reports sort by createdAt descending, then ID descending. Pages contain at most 50 summaries; Load More Reports appends older reports. Findings are omitted from list responses.

`GET /api/analytics/reports/:reportId` returns saved metadata and persisted analytical evidence. It never runs current analytics. Original park names/codes, filters, categories, selected findings and limitations come from JSONB, so source edits cannot relabel or recalculate historical reports.

The Saved Reports navigation is within Analytics & Reports. History cards show title, park, readable period, categories, generation/update timestamps, version, active state and ID. View Report exposes metadata editing, regeneration, saved PDF and archive actions. Loading, empty history, load failure, missing/archived report feedback, retry and refresh are included.

## 6. UPDATE

`PATCH /api/analytics/reports/:reportId` accepts only title and/or notes. A strict Zod allow-list rejects criteria, snapshots, analytical results, parkId, generatedAt, version, creator and archive fields, including mixed metadata-plus-forged-findings requests. An empty patch is rejected.

The Prisma write explicitly constructs only metadata fields and requires archivedAt=null. Analytical JSON, original generation timestamp and period remain unchanged. Metadata saves return the saved snapshot, update history cards and synchronize the generated-preview cache. A racing archive cannot be overwritten by metadata editing.

## 7. DELETE/archive

`DELETE /api/analytics/reports/:reportId` sets archivedAt and updates the report timestamp. It never deletes conservation-source records or other report versions. Repeated archive is idempotent.

A native accessible in-app dialog identifies the report by title, version and ID. It offers Cancel and Archive Report, supports Escape and modal keyboard behavior, disables repeated submissions, and retains failure feedback with Retry Archive Report. The report leaves active history, and its cached Analysis preview is invalidated.

Archived reports return 410 for detail, metadata editing, PDF and regeneration; archive itself remains safe to repeat. There is no archive/restore screen in this batch. Records remain recoverable in PostgreSQL.

## 8. Regeneration/versioning

`POST /api/analytics/reports/:reportId/regenerate` accepts an empty JSON object. It runs authoritative current analytics using the original saved criteria and copies title/notes into a NEW record with a NEW ID, parentReportId and incremented version. The original record remains unchanged.

Each version has one successor. Regenerating an already-succeeded parent returns controlled 409 feedback directing the manager to the newest version. This also protects concurrent/double regeneration. To use changed criteria, Analyze those criteria and Generate & Save a separate version-1 report. If the successor was archived, this batch does not restore it; a separate report can still be created.

## 9. Integrity and access

Client-supplied incident totals, hotspots, coverage, HWC findings, route counts, park labels or complete result objects are REJECTED by the strict creation contract. The client sends criteria only; only the existing server analytics service can issue persisted findings. PATCH cannot rewrite findings or criteria. Stored evidence is structurally validated on read; corrupt evidence fails safely without replacement by a fresh calculation.

Every report route remains behind the existing analytics managerOnly middleware, including GET history/detail/PDF. The public GET /api/parks boundary remains metadata-only. This preserves the current access boundary; the client-controlled x-user-role header remains a known authentication limitation, not a secure individual identity/ownership system.

Malformed IDs and JSON return controlled 400 responses. Missing reports return 404, archived reports 410, regeneration conflicts 409, and internal/database failures generic 500 messages. Prisma, SQL, stack and connection details are not exposed. Report responses use Cache-Control: no-store.

## 10. Saved PDF

`GET /api/analytics/reports/:reportId/pdf` loads the saved report through the same detail service and passes it to the existing PDF renderer. It never accepts a browser snapshot and never reruns analytics. The shared report document builder includes title, notes, ID, version, metadata-update time and parent ID alongside original scope/findings.

The old snapshot-upload `POST /api/analytics/reports/pdf` is removed. The legacy server-calculated GET /api/analytics/report remains compatible. Filenames retain the safe existing convention, e.g. conservation-report-serengeti-north-2026-10-07.pdf.

## 11. Meaningful comments

savedReportService explains why CREATE recomputes server analytics, READ uses saved evidence, UPDATE allow-lists metadata, DELETE archives only reports, and regeneration inserts a new version. It also explains creator limitations and why corrupt snapshots must not be repaired with newer data.

savedReportValidation explains strict allow-list rejection. reportController and the client API explain ID-based saved-PDF integrity. useConservationReport explains server-result preview and archive-cache invalidation. useSavedReports explains synchronous duplicate-request guards and metadata/archive behavior. SavedReportViews explains native modal semantics. Three analytics map comments explain avoiding a queued zoom callback after report/history navigation removes the map.

## 12. Every changed file and reason

Paths below are relative to the repository root. All are modified or added for this batch.

| File | Reason |
| --- | --- |
| server/prisma/schema.prisma | StatisticalReport model and inverse Park relation |
| server/prisma/migrations/20261007010000_statistical_reports/migration.sql | Additive report table, indexes and foreign keys |
| server/src/modules/analytics/savedReportContract.ts | Shared typed create, metadata, saved-detail and history contracts |
| server/src/modules/analytics/savedReportValidation.ts | Strict create/update/ID/history validation |
| server/src/modules/analytics/savedReportService.ts | Authoritative creation, persisted reads, metadata update, archive and linear regeneration |
| server/src/modules/analytics/reportController.ts | Thin CRUD/PDF handlers and safe errors |
| server/src/modules/analytics/routes.ts | Manager-guarded saved CRUD/version/PDF endpoints |
| server/src/modules/analytics/reportContract.ts | Existing document/filename reuse with saved metadata |
| server/src/modules/analytics/reportValidation.ts | Clarify structural validation cannot establish client authority |
| server/src/middleware/errors.ts | Safe malformed-JSON 400 handling before module routing |
| server/tests/analyticsPrismaMock.ts | Typed StatisticalReport persistence mock boundary |
| server/tests/savedReportCrud.test.ts | HTTP/service/persistence integrity, CRUD, errors, pagination and version tests |
| server/tests/conservationReport.test.ts | Preserve structural/PDF tests using the redesigned saved-detail boundary |
| client/src/features/analytics/AnalyticsPage.tsx | Saved Reports navigation, retained analysis state and cache callbacks |
| client/src/features/analytics/api.ts | Criteria-only save and ID-based history/detail/update/archive/regeneration/PDF |
| client/src/features/analytics/useConservationReport.ts | Saved server-response preview, duplicate guards and cache consistency |
| client/src/features/analytics/ConservationReport.tsx | Generate & Save wording and saved-preview/back-navigation support |
| client/src/features/analytics/SavedReports.tsx | Small history/detail screen coordinator |
| client/src/features/analytics/useSavedReports.ts | CRUD request state, retry, cancellation and duplicate guards |
| client/src/features/analytics/SavedReportViews.tsx | Responsive history cards and accessible archive dialog |
| client/src/features/analytics/ReportMetadataForm.tsx | Validated title/notes editing |
| client/src/features/analytics/analytics.css | Responsive saved-history/form/dialog layout and touch targets |
| client/src/features/analytics/HotspotMap.tsx | Immediate automatic bounds fitting avoids map teardown callback error |
| client/src/features/analytics/PatrolCoverageMap.tsx | Same observed report-navigation map teardown fix |
| client/src/features/analytics/ConflictLocationResults.tsx | Same lifecycle protection for the HWC map |
| client/src/features/analytics/savedReportTestFixtures.ts | Typed saved-report API test fixtures |
| client/src/features/analytics/SavedReports.test.tsx | History/detail/edit/archive/regeneration/PDF recovery tests |
| client/src/features/analytics/Batch4Report.test.tsx | Criteria-only generation, server findings, cache consistency and saved PDF regression tests |
| client/src/features/analytics/AnalyticsPage.test.tsx | Adapt report mocks/wording without removing analysis assertions |
| client/src/features/analytics/Batch2Results.test.tsx | Update only the renamed generation button assertions |
| client/src/features/analytics/Batch3Results.test.tsx | Update only the renamed generation button assertion |
| server/src/modules/analytics/BATCH4_REPORT_CRUD.md | This implementation/verification report and manual guide |

## 13. Files outside UC-D

The schema and migration are necessary database changes explicitly requested. The only additional source change outside analytics is `server/src/middleware/errors.ts`: Express parses JSON before analytics routes run, so malformed JSON needs a safe shared response there. It only recognizes entity.parse.failed; other error behavior remains intact.

Analytics regression tests also cover the shared park lookup/association boundaries. No teammate workflow source, authentication, offline/PWA infrastructure, unrelated manager page, dependency manifest, or conservation-source model was redesigned. The generated tracked client/tsconfig.tsbuildinfo was restored to its starting content after verification.

## 14. Tests actually run in this task

Final UC-D backend command, from the repository root:

```powershell
npm run test --workspace server -- tests/analytics.test.ts tests/analyticsBatch2.test.ts tests/analyticsCalculations.test.ts tests/parkScopedAnalysis.test.ts tests/patrolCoverage.test.ts tests/parkLookup.test.ts tests/parkAssociationWorkflows.test.ts tests/conservationReport.test.ts tests/savedReportCrud.test.ts
```

Result: **225 passed, 0 failed; 9 suites passed**. HTTP validation, real analytics calculations and rendering use mock persistence, so these tests do not write conservation data to Neon.

Final UC-D frontend command:

```powershell
npm run test --workspace client -- src/features/analytics
```

Result: **110 passed, 0 failed; 7 files passed**. Includes Batch 1–3 regressions and new report creation/history/detail/metadata/archive/regeneration/export/cache behavior.

```powershell
npm run build
npm run lint
```

Both passed for client and server. Build includes both TypeScript checks and Vite/PWA production output. Vite emitted its large-chunk warning (about 1.2 MB uncompressed application bundle). Lint reported no failures. No dependencies were added.

Full-suite diagnostic commands also run during this task:

- `npm run test:server`: 266 passed, 1 failed; 12 passed suites and 2 failed suites. One suite cannot load missing mongoose. The patrol failure expects Northern Boundary Patrol but the assigned fixture in Neon is Rhino Sanctuary Perimeter Sweep. Jest remained open after the results; its runner was stopped.
- `npm run test:client`: 141 passed, 3 failed; 10 passed files and 2 failed files. App.test expects the obsolete text Analytics; UC-C tests fail their collar-form submission and acknowledged-alert guidance expectations. Those files/features were not changed. These are the exact diagnostic-run counts, before the final additional UC-D tests; they are not claims that the final complete suites are green.

Important verification correction: the pre-existing full server suite was discovered to write directly to the configured Neon database. Its newly created rows were audited and backed up. Only the exact records created by that run were removed, checking IDs, timestamps, test identifiers and dependencies first: 5 incidents, 10 sessions, 11 assignments, 16 alerts and their own child evidence/waypoints/responses. No pre-existing conservation record was targeted. All source counts returned to the pre-run values. The full database-writing suite was not rerun. This cleanup corrected a test-run side effect; report CRUD itself never mutates conservation sources.

Live check, from server:

```powershell
npx tsx ../test-results/batch4-live-verification.mts
```

Passed Analyze, database CREATE/READ/metadata UPDATE, forged-payload rejection, saved PDF, regeneration, original preservation and archive/idempotency against Neon. It used Serengeti Northern Sector and 2026-10-06 through 2026-10-07, confirming 2 incidents, 1 hotspot, 66.7% patrol coverage and 0 assigned HWC alerts/responses. Two real server-generated verification reports remain archived: cmuxp9yr500002gv51cjfgj9m (v1), cmuxpa00t00012gv5n2icc8rb (v2).

Source counts after correction: parks 1, routes 3, sessions 73, waypoints 74, incidents 11, evidence 10, alerts 29, responses 14 — equal to the pre-verification counts.

Real Chrome check, from root:

```powershell
npx tsx test-results/batch4-browser-check.mjs
```

Passed 16 responsive measurements: history, detail, editing and archive confirmation at 1440, 768, 375 and 320 pixels. No page overflow; controls at least 44 pixels; long titles/notes wrapped. Analyze, criteria-only generation, metadata editing with unchanged findings, PDF, new versions, native modal keyboard/Escape behavior and confirmed archive passed. Final runtime exceptions: 0. Browser API interception uses local fixtures; live database behavior is covered separately above.

Ignored local evidence is in test-results: batch4-ucd-server-final.log, batch4-ucd-client-final.log, batch4-build-final.log, batch4-lint-final.log, batch4-live-verification.json, batch4-browser-verification.json, mobile screenshots, and the own-test-record audit/backup/cleanup files. These are not staged deliverables.

## 15. Exact manual browser guide

1. From the repository root run `npm run dev`. Open `http://localhost:5173/manager/analytics` and select Analysis.
2. Choose **Serengeti Northern Sector**, start **2026-10-06**, end **2026-10-07**, and all four categories. Leave optional filters at All/blank.
3. Select Analyze. Confirm Applied Scope and the expected 2 incidents, 1 hotspot, 66.7% coverage, and 0 assigned HWC alerts/responses.
4. Select **Generate & Save Report** once. Check its disabled/loading state. The server recomputes using Applied Scope, then displays the saved report preview.
5. Record the displayed **Saved Report ID**, version 1 and generation timestamp. Confirm scope, findings, category selection and limitations. A later source change may legitimately alter the newly generated result relative to the earlier analysis; the saved preview is authoritative.
6. Select **Saved Reports**. Find the new report in Report History. Select **View Report** and confirm the same ID, scope and findings. Reload the page, reopen Saved Reports and View Report to demonstrate real persistence.
7. Select **Edit Report Details**. Enter a distinctive title and notes, then **Save Changes**. Confirm success, updated metadata timestamp, unchanged generation timestamp, unchanged criteria and unchanged findings.
8. Select **Export PDF**. Check the downloaded conservation-report-serengeti-north-2026-10-07.pdf (or the actual generation date in its filename). Confirm edited title/notes and the original saved analytical values. Export does not call Analyze.
9. Select **Return to Report History**, reopen the report, then **Create New Version**. Record the new ID, version 2 and previous-version ID. The server uses the saved criteria against current data. It may have the same totals if sources are unchanged.
10. Return to history. Open v1 and verify its analytical findings and generation timestamp remain unchanged. Open v2 and confirm it has its own saved ID/snapshot. Regenerating v1 again should explain that a successor already exists; use v2 for v3.
11. From v2 choose **Archive Report**. Verify the dialog identifies the title/version/ID. Press Cancel or Escape and confirm the report stays active. Open the dialog again and confirm Archive Report.
12. Confirm success and removal from active history, including after Refresh Report History and a browser reload. v1 must still be available. A direct request for the archived detail/PDF returns 410. Repeated DELETE is safe.
13. Open the existing incident, patrol and conflict views read-only, or compare database record counts. Report actions must not create/update/delete those source records. Do not alter teammate source data just to test report immutability; automated tests simulate source changes safely.
14. Repeat history/detail/edit/archive on tablet and phone widths; check wrapped titles/notes, readable controls, keyboard focus and modal cancellation.
15. For integrity verification, open DevTools Network. CREATE must submit `{ criteria }` (plus optional metadata), not analyticsResult/snapshot/totals. PATCH must contain only title/notes. Saved PDF is a GET by report ID. Replaying CREATE with an extra analyticsResult or PATCH with criteria/snapshot must return 400 and leave the saved report unchanged.
16. To test retry, use DevTools request blocking for reports or temporarily stop the API. History/detail/edit/export/archive should show friendly errors. Re-enable the API and use Retry. For an interrupted CREATE, first refresh history because a request may have committed before its response was lost.

## 16. Remaining limitations

- The existing client-controlled MANAGER header is retained; there is no trustworthy authenticated creator identity or per-manager ownership enforcement. This batch does not redesign authentication.
- Saving recomputes at request time. It does not certify that current source records are identical to the earlier unsaved Analyze response. The saved server preview makes that boundary explicit.
- Source reads reuse the existing service's multiple queries; this batch does not add transaction isolation across all conservation reads. Once persisted, the issued report JSON is stable.
- Metadata uses normal last-write-wins behavior. Buttons guard duplicate in-flight requests; no general network-retry idempotency system was introduced. An interrupted create may have succeeded; inspect history before retrying.
- Versions are linear with one successor. Criteria changes create independent reports. Archived reports remain stored but have no restore/archive browsing UI.
- Existing PDF font/encoding, map tiles, and application bundle-size limitations remain; no CSV/Excel, cryptographic signing, GIS redesign or offline report synchronization was added.
- Complete repository test suites retain the unrelated failures listed above. Final relevant UC-D tests, build, lint, live CRUD and responsive browser checks passed.

## 17. Git status

The initial working tree was clean. Final changes comprise 20 modified tracked files and 12 new files (including the migration SQL and this report), all listed in section 12. Nothing is staged; nothing was committed or pushed. Local test-results evidence remains ignored. No dependency/lockfile, authentication, teammate workflow source or generated tsbuildinfo change is included.
