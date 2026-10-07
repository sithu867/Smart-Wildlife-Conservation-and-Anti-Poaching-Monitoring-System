# UC-D Batch 6 polish handover

Status: **BATCH 6 POLISH COMPLETE**. Scope: Park Manager analytics and reports only.

## Implementation and validation

1. **Future-only periods:** the shared live criteria schema rejects `start` after the current UTC calendar date with the requested message and `start` field path. The clock is evaluated when parsing, including long-lived servers. Analyze, generation and regeneration enforce it on the server; the form uses that same schema and focuses Start Date. Today, history, periods starting before/today and ending later, inclusive UTC end-of-day boundaries and 7/30/90-day presets remain supported. Approved server date errors remain actionable when client/server clocks differ.
2. **Supported dates:** no existing domain minimum was found. `MIN_ANALYSIS_DATE = '0001-01-01'` supports the full existing four-digit civil calendar while excluding year 0000, malformed and impossible dates. The shared date helper/schema and native date-control minimums agree. No arbitrary modern cutoff was introduced.
3. **Metadata validation:** shared Zod fields retain trimming, title length 1–200 and nullable notes up to 5000 characters. HTTP 400 responses carry approved `fieldErrors.title`/`notes`; the client accepts only those safe messages, associates them with controls and focuses the invalid field. Typed title/notes survive failure. PATCH still strictly allows only title/notes; analytical evidence, park, dates and version cannot be edited.
4. **Unsaved edits:** exact typed values are compared with persisted metadata. Cancel, editor toggle, either history button, Analysis switching, regeneration and archive are guarded. The existing native-dialog convention supplies Stay/Discard, Escape handling, modal focus trapping and focus restoration. Unchanged/reverted fields do not prompt. Successful save replaces persisted display metadata and clears dirty state.
5. **Readable presentation:** a small client helper formats enums and timestamps in UTC across filters, results, breakdowns, history and saved preview/narrative/tables. IDs and route names are not processed as enums. The report document accepts optional presentation formatters; export renderers retain their existing analytical cells and exact ISO timestamps. Stored/API enum values and date filtering are unchanged.
6. **Versioned filenames:** saved PDF/CSV/XLSX exports use `-v<version>` from the persisted report loaded by the server. Existing park-code sanitization, format allow-list, download headers and server-owned content remain. Invalid runtime version values are rejected. Unsaved helper callers retain legacy filenames.
7. **Pending writes and recovery:** synchronous request guards prevent duplicate submissions. Metadata save, new version and archive signal the parent to disable both UC-D view switches; internal navigation also consults the pending ref. An accessible status explains the wait and controls restore after settlement. Network/5xx/unknown write outcomes say the request may have completed, preserve drafts and require a fresh first history page before another write. Recovery never claims rollback or blindly resubmits a possibly committed operation. Refreshing with dirty metadata still asks before discard.

Persisted snapshot validation retains structural/date checks but does not apply a moving current-day rule. Thus old saved evidence remains readable/exportable; recalculating a new version must pass current live validation.

## Changed files and reasons

Paths in the first table are under `client/src/features/analytics/`.

| File | Reason |
| --- | --- |
| `AnalysisCriteriaForm.tsx` | Shared supported-date minimum and readable option labels with unchanged enum values. |
| `criteria.ts` | Preserve specific future/boundary messages from the shared schema. |
| `AnalyticsPage.tsx` | Guard view switching, disable switches during saved writes and focus approved server date failures. |
| `formatting.ts` (new) | Focused enum, UTC timestamp and typed report-cell presentation helpers. |
| `AnalyticsCharts.tsx` | Readable breakdown row labels. |
| `AnalyticsResults.tsx` | Readable applied filter values and analysis timestamp; preserve ranger IDs. |
| `CategoryResults.tsx` | Readable hotspot incident types. |
| `ConflictLocationResults.tsx` | Readable conflict location breakdown labels. |
| `PatrolCoverageResults.tsx` | Consistent readable UTC last-activity timestamps. |
| `ConservationReport.tsx` | Apply browser presentation formatters to preview text. |
| `ReportSections.tsx` | Format saved narrative and typed table columns without mutating exported values. |
| `ReportMetadataForm.tsx` | Shared field validation, inline errors, focus, preserved input and dirty notifications. |
| `useSavedReports.ts` | Dirty-action guards, write status, safe server field errors and uncertain-outcome recovery. |
| `SavedReports.tsx` | Connect editor/dialog/navigation protection and accessible busy/recovery feedback. |
| `SavedReportViews.tsx` | Native discard dialog, readable history timestamps and archive recovery control. |
| `analytics.css` | Wrapping field feedback, visible focus, vertical-only textarea resizing and mobile-safe dialog controls. |
| `Batch6Polish.test.tsx` (new) | 41 focused validation, metadata, dirty-exit, busy/recovery and formatting regressions. |
| `Batch2Results.test.tsx` | Update expectations for readable breakdown labels. |
| `Batch3Results.test.tsx` | Update expected UTC timestamp presentation. |
| `Batch3UX.test.tsx` | Update readable applied-filter assertions; stored filter expectations remain. |
| `Batch4Report.test.tsx` | Update readable preview/narrative assertions. |
| `Batch5Report.test.tsx` | Update readable preview/table assertions. |
| `SavedReports.test.tsx` | Preserve known-rejection retry coverage and verify refresh recovery after uncertain archive. |

Paths below are under `server/`.

| File | Reason |
| --- | --- |
| `src/modules/analytics/contract.ts` | Supported-date constant/messages and testable UTC future-period predicate. |
| `src/modules/analytics/validation.ts` | Authoritative shared live-period validation; separate structural persisted criteria validation. |
| `src/modules/analytics/metadataValidation.ts` (new) | Reusable strict metadata field rules and safe field-error helpers. |
| `src/modules/analytics/savedReportValidation.ts` | Reuse metadata fields while retaining existing create/update allow-lists. |
| `src/modules/analytics/reportController.ts` | Approved metadata field errors and clear supported/future date messages. |
| `src/modules/analytics/reportContract.ts` | Version suffix and optional browser presentation formatters; default export values retained. |
| `src/modules/analytics/reportValidation.ts` | Preserve reopening immutable evidence independently of the moving live-period rule. |
| `tests/batch6Validation.test.ts` (new) | 24 deterministic UTC/date-boundary, metadata and filename-safety tests. |
| `tests/savedReportCrud.test.ts` | Nine new HTTP/version/export/integrity regressions and updated filename assertions. |
| `tests/conservationReport.test.ts` | Expect persisted version suffix in download/header safety checks. |
| `src/modules/analytics/BATCH6_POLISH_HANDOVER.md` (new) | This requested handover. |

No project-wide shared files were changed. The shared client/server helpers listed above belong exclusively to UC-D. Their changes keep validation consistent and preserve existing export consumers through optional presentation arguments.

## Comments and accessibility

Comments explain why future-only coverage is misleading, why UTC calendar comparison happens at parse time, why year 1 is the supported lower boundary, why persisted evidence avoids live date policy, why dirty comparisons retain exact typed text, why server messages are allow-listed, why transport cancellation cannot imply rollback, why recovery requires fresh history, and why filenames use persisted versions. Presentation comments protect IDs, names, ISO evidence and analytical export cells.

Existing WildlifeGuard styles are retained. New field feedback uses `aria-invalid`, `aria-describedby`, associated labels and focus movement. Dialogs have accessible names/descriptions, native focus trapping, Stay as the safe initial focus, Escape support and trigger-focus restoration. Busy/recovery messages use live status semantics. Controls retain at least 44px touch targets; errors/long text wrap; tables retain bounded keyboard-accessible horizontal scrolling.

## Exact final verification

All commands ran from the repository root; all final commands exited **0**.

| Command | Result |
| --- | --- |
| `npm run test --workspace client -- src/features/analytics` | **9 files, 162 tests passed**. Includes all existing Batches 1–5 client tests. |
| `npm run test --workspace server -- --runTestsByPath tests/analytics.test.ts tests/analyticsBatch2.test.ts tests/analyticsCalculations.test.ts tests/conservationReport.test.ts tests/parkAssociationWorkflows.test.ts tests/parkLookup.test.ts tests/parkScopedAnalysis.test.ts tests/patrolCoverage.test.ts tests/savedReportCrud.test.ts tests/batch6Validation.test.ts` | **10 suites, 276 tests passed**. |
| `node node_modules/typescript/bin/tsc -p client/tsconfig.json --noEmit` | Passed. |
| `node node_modules/typescript/bin/tsc -p server/tsconfig.json --noEmit` | Passed. |
| `npm run build --workspace client` | Passed TypeScript and Vite/PWA build. Existing >500kB chunk warning remains; confirmed in prior Batch 5 build log. |
| `npm run build --workspace server` | Passed. |
| `npm run lint` | Client and server ESLint passed. |
| `node test-results/batch6-browser-check.mjs` | **36 layout checks passed**, zero runtime errors. Nine states at 320/375/768/1440px: date errors, generated preview, history, detail, editor, discard modal, metadata errors, pending save and archive modal. No page overflow; touch targets, native dialog keyboard behavior, error focus, busy protection, generation/export retry and saved lifecycle passed. |
| `git diff --check` | Passed. |

The initial focused baseline passed 121 client tests and 221 backend tests (seven suites). The final backend selection also includes the two UC-D park-association/lookup suites used in Batch 5. No unrelated failing tests were hidden or repaired. Existing fixture warnings about offline/IndexedDB and React scheduling remain non-failing; unrelated database-backed full-project suites were deliberately not run.

Vitest/Vite and Chrome needed elevated execution because sandbox restrictions blocked esbuild parent-directory resolution and Chrome startup. No dependency/configuration changes were made to bypass those restrictions.

## Safety, artifacts and remaining limits

- Batches 1–5 analytics, applied scope, no-data/retry, prior-result preservation, Generate & Save, CRUD, server snapshots, history/detail, metadata update, versions, archive and PDF/CSV/XLSX export remain covered and passing.
- No authentication, shared navigation, teammate UC-A/B/C workflow, PWA/offline source, schema, migration, unrelated model or route was changed.
- No live database-writing verification was performed. Backend tests mock Prisma; browser tests intercept every API using local fixture snapshots. No real test reports were created; no data cleanup is required.
- Navigation protection covers the requested UC-D view switches and local saved-report actions. Browser/tab closure and navigation to another application route remain outside this focused change; transport loss cannot guarantee rollback or exactly-once completion. Recovery explicitly reflects this limitation.
- Historical snapshots retain their evidence when reopened; they are not silently recalculated to repair earlier analysis choices.
- Browser harness/results/screenshots are local ignored artifacts under `test-results/batch6-*`. Focused test logs are in the OS temporary directory as `ucd-batch6-client-tests.log`, `ucd-batch6-server-tests.log` and `ucd-batch6-browser-final.log`.
- Final Git state: **29 modified UC-D files and 5 new UC-D files**, all unstaged. No staged changes, commits or pushes. The build-generated tracked TypeScript cache was restored to its original bytes so it is excluded from this change.
