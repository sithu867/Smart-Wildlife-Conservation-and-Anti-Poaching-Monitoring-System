# UC-D Batch 5 handover — 2026-10-07

## 1. What was missing

Batch 4 already persisted server-owned StatisticalReport snapshots and supported
history, detail, title/notes updates, new versions, archive and saved PDF export.
The remaining gaps were PDF-only export controls, no CSV/XLSX serializers, a
mostly narrative preview, and report eligibility that incorrectly rejected
registered-route coverage findings when no patrol sessions matched.

## 2. Completed behavior

Analyze → review applied findings → Generate & Save Report → review saved report
identity/scope/filters/executive summary/selected sections → select PDF, CSV or
Excel → export → format-specific success feedback and filename.

Saved Reports → View Report → the same persisted preview and format selector →
export, without Analyze or Generate being called again.

## 3–6. Use-case mapping

| Requirement | Implementation |
| --- | --- |
| Main Flow 12: select Generate Report | Existing Generate & Save Report action, guarded eligibility, loading label and synchronous duplicate-request guard. |
| Main Flow 13: compile criteria/results | Captured reviewed criteria go to the server; the server runs the existing scoped analytics and validates its own snapshot. Browser findings are never authoritative. |
| Main Flow 14: generate report | Existing StatisticalReport creation saves the validated snapshot and returns the real report ID and version. |
| Main Flow 15: display report | The returned persisted snapshot opens in the improved preview with selected visual and tabular sections. |
| Main Flow 16: review report | Manager reviews identity, inclusive UTC period, meaningful filters, executive summary, stored findings, charts/maps/tables and limitations. |
| Alternate Flow 4: export | Native PDF/CSV/Excel radios and an export action work for both newly generated and reopened saved reports. |
| Exception Flow 3: generation failure | Inline accessible error, analysis/criteria preserved, Retry Generate & Save Report reuses the captured attempt, controls recover, no popup/navigation reset. Interrupted-save feedback advises checking history before retrying. |
| Exception Flow 4: export failure | Format-specific inline error and Retry Export, report and format retained, another format can be selected, no archive/delete/reset or page crash. |

## 7. Neglected-only eligibility

Client eligibility, server creation and persisted-snapshot validation share
`hasReportableFindings`. Selected patrol coverage with registered routes is
meaningful even with zero sessions. Covered=0, limited=0, neglected=3 and
coverage=0% can be saved/exported. No sessions are invented. Unselected legacy
totals do not establish eligibility; genuinely empty selected analysis is blocked.
The existing coverage calculation already classified these findings correctly
and did not need modification.

## 8. Preview

- Title, real ID, version, generated timestamp, metadata timestamp, previous
  version where applicable and manager notes remain visible.
- Park/name/code, Start Date and End Date explicitly marked inclusive UTC.
- Only relevant nonempty filters; otherwise “Advanced filters: All available records”.
- Shared deterministic executive-summary builder reads persisted selected
  results, including covered/limited/neglected route counts. No inferred risk scores.
- Incident and HWC time charts reuse existing accessible data-table equivalents.
- Hotspot and patrol maps reuse saved coordinates/geometry. HWC location content
  uses stored location groups. Missing geometry retains numerical tables.
- Selected sections have semantic tables, captions and column/row headers,
  plus an expandable stored-findings narrative.
- Light report identity is scoped away from the global navigation-header flex
  styling, fixing narrow title columns on phones without changing teammate CSS.

## 9–12. Export implementation

### PDF

The established deterministic PDF renderer is retained. Its shared document
builder now includes route classification counts in the executive summary,
hotspot type breakdowns, coverage exclusions and HWC location breakdowns.
PDF includes title, park, period, filters, ID/version, findings, limitations,
manager metadata and page numbers. Maps/charts have stored numerical equivalents;
there is no screenshot rendering or live analytics refresh.

### CSV

UTF-8 CSV with BOM, CRLF rows, consistent width and explicit Section/Table
markers. Metadata, criteria, summary, selected findings, breakdowns, original
time buckets, ranks, route details/coordinates and HWC locations are flattened
into rows. Quotes, commas and line breaks are escaped. Potential spreadsheet
formula text is neutralized; numeric cells remain numbers. No JSON-cell dumping.

### Excel

Real ZIP/OOXML XLSX generated in memory using `write-excel-file` 4.1.1. A Summary
sheet is always included; Incident Statistics, Incident Hotspots, Patrol Coverage
and HWC Trends are included only when selected. Clean tables, bold headers,
column widths, numeric values and explicitly typed string cells prevent malformed
values and formula execution. No decorative complexity or browser spreadsheet bundle.

### Saved reports

Both `/api/analytics/reports/:reportId/pdf` (preserved) and
`/api/analytics/reports/:reportId/export?format=pdf|csv|xlsx` read the saved detail
service. The latter validates the strict format query. Exporting never invokes
analytics or modifies the saved report. Server-issued attachment filenames are
exposed to the browser; the client validates nonempty response MIME type and
cancellation before starting a download or announcing success.

## 13. Validation and integrity

- Existing manager authorization guard retained.
- CUID report IDs, existence, archive status and full stored-snapshot schema validated.
- Only lowercase `pdf`, `csv`, `xlsx`; unsupported/missing/array values and extra
  query fields, including arbitrary filenames, receive controlled 400 responses.
- Missing report: 404; archived report: 410; malformed persisted evidence/database
  failures: controlled 500 with no database internals or silent recalculation.
- Metadata PATCH remains restricted to title/notes; criteria/results/version
  edits fail visibly. Existing CRUD/version/archive rules remain unchanged.
- Filenames are server-controlled, slugged, bounded and safe for attachment headers.
- Loading flags disable relevant controls; refs block same-tick double clicks.
  Abort/revision guards suppress stale generation/export feedback and downloads.

## 14. Accessibility and responsive checks

Native labelled radio group and buttons, visible keyboard focus, status/error
announcements, semantic tables and keyboard-scrollable table regions are used.
Existing chart data tables remain. Layout checks at 320, 375, 768 and 1440 pixels
verified generated preview, saved detail, history, edit and archive views: 20
checks passed, without document/main overflow or JavaScript runtime exceptions.
Radio labels have at least 44px height; buttons wrap; long IDs/titles/notes/filenames
remain contained. Screenshot inspection caught and verified the report-header fix.

## 15. Every tracked file changed

Paths below are repository-relative.

| File | Reason |
| --- | --- |
| client/src/features/analytics/AnalyticsPage.tsx | Connect generated preview format selection and export action. |
| client/src/features/analytics/AnalyticsResults.tsx | Reuse shared selected-findings eligibility. |
| client/src/features/analytics/ConservationReport.tsx | Preview sections, native format selector, format/loading/error/success feedback. |
| client/src/features/analytics/ReportSections.tsx | New snapshot-only maps/charts, stored narrative and semantic report tables. |
| client/src/features/analytics/useConservationReport.ts | Selected-format export/retry with preserved snapshot and stale-request protection. |
| client/src/features/analytics/useSavedReports.ts | All-format saved export, format-specific failures/retry and retained state. |
| client/src/features/analytics/SavedReports.tsx | Connect saved-detail format selection; keep CRUD actions protected while busy. |
| client/src/features/analytics/api.ts | ID/format validation, snapshot-free export request, response/filename/cancellation validation. |
| client/src/features/analytics/analytics.css | UC-D-only readable report identity, tables, radio touch targets, focus and filename wrapping. |
| client/src/features/analytics/Batch5Report.test.tsx | New format, preview, saved retry, duplicate/stale-request and API-response tests. |
| client/src/features/analytics/Batch4Report.test.tsx | Update PDF lifecycle expectations for explicit format and feedback. |
| client/src/features/analytics/SavedReports.test.tsx | Existing CRUD regression tests now exercise real charts; update PDF retry expectations. |
| client/src/features/analytics/Batch3Results.test.tsx | Correct neglected-route generation expectation. |
| client/src/features/analytics/AnalyticsPage.test.tsx | Update accessible eligibility description. |
| server/src/modules/analytics/reportEligibility.ts | New client/server shared meaningful-selected-findings rule. |
| server/src/modules/analytics/savedReportService.ts | Allow valid neglected-only reports without changing persistence. |
| server/src/modules/analytics/reportValidation.ts | Apply the same rule while retaining full snapshot consistency checks. |
| server/src/modules/analytics/reportContract.ts | Shared formats/MIME labels, safe filename extensions and complete summary/findings. |
| server/src/modules/analytics/reportTables.ts | New shared typed tabular model and category-specific helpers for preview/CSV/XLSX. |
| server/src/modules/analytics/reportCsv.ts | New structured CSV serializer and formula-text protection. |
| server/src/modules/analytics/reportXlsx.ts | New real XLSX serializer with selected sheets and typed cells. |
| server/src/modules/analytics/reportExportService.ts | New thin snapshot-read/export orchestration, separate from controllers. |
| server/src/modules/analytics/reportController.ts | Strict export query, controlled file responses and filename-header exposure; existing PDF endpoint preserved. |
| server/src/modules/analytics/routes.ts | Add the saved-report multi-format export route. |
| server/src/modules/analytics/savedReportValidation.ts | Explain why metadata cannot alter analytical evidence; validation behavior retained. |
| server/tests/savedReportCrud.test.ts | Add eligibility, PDF/CSV/XLSX, persisted-data, filename, validation and failure regression tests. |
| server/package.json | Add the XLSX writer only. |
| package-lock.json | Lock the writer and its single transitive dependency, fflate. |
| server/src/modules/analytics/BATCH5_REPORT_LIFECYCLE.md | This complete implementation/validation handover. |

No schema/migration or unrelated feature files changed. Generated TypeScript
build-cache changes were restored; the temporary local npm cache was removed.
Verification scripts, exports, screenshots, audit backups and logs are under the
already-ignored `test-results/`, outside the tracked application diff.

## 16. Dependency

`write-excel-file` 4.1.1 is the only new direct server dependency. Its one
transitive dependency is `fflate`. No spreadsheet library was already present.
It supplies proper typed multi-sheet XLSX generation with a small dependency
footprint. No client production dependency was added.

## 17–18. Commands actually run and results

Successful final commands (PowerShell log redirection omitted here for readability):

```powershell
# cwd: server
node --experimental-vm-modules ../node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/analytics.test.ts tests/analyticsBatch2.test.ts tests/analyticsCalculations.test.ts tests/conservationReport.test.ts tests/parkAssociationWorkflows.test.ts tests/parkLookup.test.ts tests/parkScopedAnalysis.test.ts tests/patrolCoverage.test.ts tests/savedReportCrud.test.ts
# PASS: 9 suites, 243 tests

# cwd: client
node ../node_modules/vitest/vitest.mjs run src/features/analytics
# PASS: 8 files, 121 tests

# cwd: repository root
npm run build
# PASS: client typecheck/Vite build and server TypeScript build
npm run lint
# PASS: client and server ESLint
python test-results/batch5-format-validation.py
# PASS: two CSVs independently parsed, two XLSX ZIP/XML structures parsed,
# selected sheet names/formula absence checked, PDF signatures/footers checked
node test-results/batch5-browser-check.mjs
# PASS: 20 responsive checks; generation/export failure/retry and CRUD browser checks;
# no runtime errors. API isolation uses actual persisted live-test snapshot values.
git diff --check
# PASS

# cwd: server
node ../test-results/batch5-live-verification.mjs
# PASS: live known-period and neglected-only analysis, real save/detail,
# six real saved exports, unchanged source counts; verification reports archived
node ../test-results/batch5-browser-snapshots.mjs
# PASS: read the two actual saved snapshots for isolated browser rendering checks
```

Earlier attempts and failures are recorded rather than hidden:

- `npm run test --workspace server -- --testPathPattern='savedReportCrud|conservationReport|patrolCoverage|parkScopedAnalysis'`
  unexpectedly ran the full server suite because the npm/PowerShell wrapper did
  not forward the selection. Result: 12 suites passed, 2 failed; 269 tests passed,
  2 failed. Unrelated failures were a patrol-sync timeout, a patrol-route-name
  expectation mismatch and an unavailable `mongoose` module. Those features were
  not changed. Subsequent server tests use explicit Jest paths and mocked persistence.
- That broader suite wrote test rows. A read-only audit and complete local backup
  identified them using the invocation window, timestamped test ranger/event IDs,
  payload signatures and creation logs. `node ../test-results/batch5-restore-test-writes.mjs`
  then passed an exact-ID, relationship-checked transaction restoring only this
  invocation's new rows: 10 sessions, 11 assignments, 4 waypoints, 5 incidents,
  5 evidence rows, 16 alerts and 9 responses. Existing records were retained.
  The audit backup and restoration result remain in `test-results/`.
- Initial client execution was blocked by Windows sandbox access to Vite/esbuild
  configuration. The permitted execution outside that sandbox resolved it.
  The initial command was `npm run test --workspace client -- src/features/analytics`;
  later runs used the direct Vitest command listed above.
- Initial client regression run: 95 passed, 15 failed, with 7 ResizeObserver
  errors. Existing tests needed the chart observer setup and new feedback/table/
  eligibility expectations. All were corrected and the final 121 pass.
- Initial XLSX HTTP tests needed an explicit binary response parser in Supertest;
  otherwise its unrecognized MIME parser returned no ZIP buffer. Corrected tests
  unzip real responses. A focused intermediate server run passed 143/143.
  Its exact command, from `server`, was:
  `node --experimental-vm-modules ../node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/savedReportCrud.test.ts tests/conservationReport.test.ts tests/patrolCoverage.test.ts tests/parkScopedAnalysis.test.ts`.
- First package install could not write the external npm cache. Re-running with
  `--cache .npm-cache --ignore-scripts --no-audit --no-fund` succeeded; cache removed.
- `npm run build --workspace server` and `npx tsc -b client` also passed during
  implementation. The final full build and lint both passed after the final changes.

Evidence: `batch5-server-final.log`, `batch5-client-final.log`,
`batch5-build-final.log`, `batch5-lint-final.log`,
`batch5-live-verification.json`, `batch5-format-validation.json`,
`batch5-browser-verification.json` and mobile PNGs in `test-results/`.

Live findings: Serengeti Northern Sector, 2026-10-06 through 2026-10-07 inclusive
UTC → 2 incidents, 1 hotspot, 66.7% coverage, 0 park-assigned alerts/responses.
The 2000-01-01 through 2000-01-02 coverage-only period has 3 registered routes,
0 sessions, 0 covered, 0 limited, 3 neglected, 0% coverage. Both reports exported
PDF, CSV and XLSX from their saved snapshots. The two newly created real-data
verification reports were archived; no pre-existing report was edited/archived.

## 19. Remaining limitations

- PDF uses the established text/numerical renderer, not embedded interactive
  maps/charts. This keeps generation independent of browser screenshots and
  faithfully preserves stored analytical values.
- On-screen map basemap tiles require network access; stored coordinate/route
  tables and findings remain available independently of basemap retrieval.
- Client duplicate guards cover in-flight requests. An interrupted successful save
  cannot be distinguished from an unsaved request by the browser; existing feedback
  advises checking history before retrying. No exactly-once save/schema redesign.
- The build emits the existing large-bundle advisory; a UC-D offline-payload test
  emits jsdom IndexedDB diagnostics while passing. No PWA/offline redesign was made.
- The unrelated full server suite is not claimed green; its failures are listed above.
- XLSX was verified with ZIP/XML parsing and saved numeric values, without a
  manual Microsoft Excel desktop session. Browser checks use isolated transport
  failures; live server/export checks separately use the database.

## 20–21. Scope and Git

No teammate UI, patrol/incident/alert lifecycle, authentication architecture,
offline synchronization, PWA behavior, unrelated models or database schema changed.
Existing report CRUD, metadata immutability, versioning, archive and authorization
were preserved and tested. Database restoration described above concerned only
confirmed new test writes from the accidental broad test run.

Working tree at completion: 21 modified tracked files and 8 new untracked files,
all listed above. No staged changes, commits or pushes. Initial working tree was
clean. `test-results/` remains ignored.
