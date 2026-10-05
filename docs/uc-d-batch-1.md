# UC-D Batch 1: analysis criteria and contract

This batch extends the existing manager analytics page and API. No UC-A, UC-B,
UC-C, shared models, authentication, or database migrations are changed.

## HTTP contract

The existing manager role header remains `x-user-role: MANAGER`.

- `GET /api/analytics/parks` reads existing MongoDB Park documents, returning
  `{ success: true, data: [{ id, name, code }] }`. An empty collection returns an
  empty list. It never seeds data or substitutes patrol-service demo records.
- `GET /api/analytics` and its existing `/summary` alias require `parkId`,
  `start`, `end`, and a nonempty `categories` array. Dates are real calendar dates
  in `YYYY-MM-DD` format, with start on or before end. Unknown fields and
  unsupported enum values are rejected. A well-formed but nonexistent park
  returns HTTP 400 with a manager-readable message.
- Encode categories with brackets, including a single category:
  `categories[]=INCIDENT_STATISTICS&categories[]=PATROL_COVERAGE`.
- Optional existing filters: `rangerId`, `incidentType`, `incidentStatus`,
  `severity`, `conflictStatus`, `conflictSource`, `conflictType`. Incident filters
  affect selected incident data; ranger filters affect incident reporters and
  patrol rangers. Conflict filters are retained in the contract but currently
  cannot produce park-scoped conflict results.

Canonical category values, labels, criteria/result types, and calendar-date
validation live in `server/src/modules/analytics/contract.ts`. This module has
no server dependencies and is imported by the client too; no build configuration
or dependency changes are needed.

## Exact park scope

The inspected patrol relationship is Park <- PatrolRoute <- PatrolAssignment
<- PatrolSession. A PatrolSession also stores `patrolRoute` directly: the existing
patrol service copies `assignment.patrolRoute` when creating a session. UC-D uses
this stored direct reference as the least invasive reliable path:

1. Verify the selected Park exists.
2. Find PatrolRoutes whose `park` equals the selected Park ID.
3. Find PatrolSessions whose `patrolRoute` is in those route IDs.
4. Find incidents whose `patrolSession` is in those session IDs.

Incident date filters use `reportedAt`. Session IDs for incident membership are
not restricted by session date, because an incident may be reported during the
requested period on a session that started earlier. Patrol source records use
`startTime`. End dates are inclusive through `23:59:59.999Z`; start dates begin
at `00:00:00.000Z`. Calendar criteria are retained unchanged in the response.

Incidents missing a session, referencing a missing session/route, or lacking a
valid route-to-park link are excluded. An empty membership list remains an empty
`$in` query; it never broadens to all parks. UC-D does not guess membership from
a ranger, description, coordinate, or proximity to a patrol route. It does not
read the unrelated modules' in-memory demo fallback stores.

Conflict alerts contain coordinates but no park/route/session reference. Parks
have no boundary geometry, and patrol routes are lines rather than park polygons.
There is therefore no reliable conflict-to-park mapping in the current models.
Park-scoped conflict queries are not executed. The API and UI state this limitation
explicitly; HWC-only criteria cannot establish whether unassociated conflicts
exist within the requested park.

## Categories and results

One or more of `INCIDENT_STATISTICS`, `INCIDENT_HOTSPOTS`, `PATROL_COVERAGE`, and
`HWC_TRENDS` can be selected. Selection determines which relevant source records
are queried. Existing incident totals/by-type statistics are shown only for
Incident Statistics. Hotspots and Patrol Coverage expose matching source counts
and `NOT_IMPLEMENTED` availability, without calculating hotspots or coverage.
HWC Trends exposes `UNAVAILABLE_PARK_ASSOCIATION`, with its algorithm also pending.

Successful responses contain `filters`, the resolved `park`, `matchedRecords`,
`categoryAvailability`, `limitations`, and a status:

- `DATA`: at least one eligible source record for selected categories matched.
  This does not mean a deferred category's algorithm ran.
- `NO_MATCHING_DATA`: no eligible park-associated source records matched selected
  categories. HTTP 200 is retained, the UI says **No matching conservation data**,
  and no statistic cards are displayed. Scope limitations remain visible.
- Invalid criteria use HTTP 400; database/API failures use HTTP 500 with a stable
  message. Failure is never converted into an empty successful result.

## Editing, Analyze, Retry, Reset

The page loads parks initially and waits for explicit Analyze. Park and both dates
must be entered; Incident Statistics is the initial category. Frontend validation
also checks the park against loaded options, real dates, range order, nonempty
supported categories, and the visible optional enum filters. Zod independently
validates the backend contract; the service checks park existence.

`draftCriteria` holds editable form values. Analyze validates and deep-copies the
criteria/category array into the request snapshot. Successful criteria and results
commit together as `appliedCriteria` and data. Prior reviewed results keep their
prior applied scope while another request is pending or fails. Draft changes do
not trigger a query or relabel results. The applied park, dates, categories, and
visible optional filters are shown beside results.

Duplicate requests are blocked with a synchronous pending-request guard and a
disabled Analyze button. Forms remain visible/editable during processing. Retry
reuses the failed request snapshot, even if the draft changed after that request.
Analyze uses the current draft. Reset aborts/invalidate pending analysis, clears
results/errors, and restores empty park/dates/optional filters plus the initial
category. Sequence checks ignore stale responses even if cancellation is ignored.

The existing PDF download and backend legacy report entry points are retained.
The manager-page download sends applied criteria rather than current draft values
and is disabled for no-data results. No report preview, persistence/history, or
new export format is implemented. Legacy unscoped report callers keep their prior
optional-filter API for backward compatibility; Analyze always uses the new
required criteria contract.

## Validation evidence and remaining work

`server/tests/analytics.test.ts` tests the real HTTP/controller/schema/service
path with Mongoose boundaries mocked. It checks validation, authorization, query
scope and dates, category routing, no-data, limitations, and safe API failures.
`client/src/features/analytics/AnalyticsPage.test.tsx` uses Vitest/Testing Library
to check controls, validation, requests, snapshots, retries, reset/cancellation,
no-data, park recovery, API encoding, and existing report criteria.

These tests do not use a live MongoDB instance. Production database availability,
real data completeness, and dangling legacy references remain deployment/data
concerns. Later UC-D work includes hotspots/maps, coverage and neglected routes,
conflict-to-park association and time series, major charts, report preview,
StatisticalReport persistence/history, and CSV/Excel export. None is implemented
in Batch 1.

Validation run for this implementation:

- Focused UC-D frontend: 19 passed.
- Focused UC-D backend: 34 passed. Full backend: 82 passed across six suites.
- Full frontend: 52 passed, three failed. The same three failures were reproduced
  with the original analytics page through a temporary Vitest alias:
  `App.test.tsx` expects the exact text `Analytics`; the existing UC-C tests expect
  a simulator button label and an acknowledged-alert instruction that do not
  match the current UI. These unrelated tests and UC-C code were not changed.
- Client and server `tsc --noEmit` checks passed. Configured `npm run lint` passed.
- The Vite production build and server TypeScript compilation passed. Vite's
  existing large-chunk warning remains; no unrelated bundle refactor was made.
- Tests use the project's existing Vitest/Testing Library and Jest/Supertest
  frameworks. No dependencies or test/build configuration were changed.
