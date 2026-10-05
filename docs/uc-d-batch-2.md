# UC-D Batch 2: incident statistics, hotspots and conflict trends

This extends the existing Batch 1 contract, queries and manager workflow. It adds
no shared model fields, dependencies, migrations, authentication or offline logic.
UC-A, UC-B and UC-C implementation files and tests are unchanged.

## Category contract and scoping

The existing criteria validation, inclusive UTC dates, park selector, optional
filters, draft/applied snapshots, request cancellation, errors and Reset remain.
New optional response sections are present only when the corresponding category
is selected: `incidentStatistics`, `incidentHotspots`, `conflictTrends`.
Existing summary/grouping fields remain compatible with the basic PDF endpoint.

Incident Statistics and Incident Hotspots use a single MongoDB query through
Park -> PatrolRoute -> PatrolSession -> ConservationIncident. PatrolSession's
stored route is copied from the assignment by the existing patrol service.
Records with no valid session/route-to-park link are excluded, including dangling
references. A ranger's identity or incident coordinate is never used to invent
park membership. Incident filters use `reportedAt`, `reportedBy`, `incidentType`
and, when provided, `status`. Session membership is not restricted by start date,
because an in-period incident may be reported during an older session.

HWC Trends has **ALL_PARKS_UNASSIGNED** scope and **AVAILABLE_UNSCOPED** availability.
It is not scoped to the selected park. The model inspection confirmed that
`animalId` is only a string and there is no implemented animal-to-park model;
other domain names are placeholders. Alerts have no park/session/route reference.
Parks have no boundaries, and patrol route lines cannot substitute for polygons.
The API, applied-scope panel, HWC section and basic PDF explicitly identify this
limitation. Changing the selected park does not restrict HWC records.

## Incident statistics

Counts real matched incident records, with breakdowns by type and current saved
status, plus a reported-date time series. Details are calculated only when
Incident Statistics is selected. Totals, grouping tables and a Recharts line chart
are displayed. Charts also have accessible tables containing the exact values.

## Deterministic geographic hotspot rule

- Divide latitude/longitude into fixed **0.01-degree cells** using floor indices.
  Decimal boundary noise is normalized far below GPS precision before flooring.
- Require **at least two incidents** in a cell. Single-incident cells are retained
  only in the isolated-incident count, not advertised as hotspots.
- Reject absent, string, non-finite or out-of-range coordinates. Valid zero
  coordinates are accepted.
- Use the mean of real cell coordinates as the representative location. Return
  count, rank, cell ID, representative coordinates and incident-type breakdown.
- Rank by descending incident count; coordinate ordering breaks ties
  deterministically. Count-based concentration is LOW for 2–4 incidents, MEDIUM
  for 5–9, and HIGH for 10 or more. These are descriptive counts, not predicted risk.

Cells are about 1.1 km north-south. Longitude width decreases with latitude, so
cells do not have constant physical area. Near points can fall on different sides
of a grid boundary; adjacent cells are deliberately not merged. This is an
explainable concentration rule, not distance clustering, ML or boundary inference.

React Leaflet renders only backend hotspots, using larger circles for higher
counts and concentration colours with a visible legend. The map fits real points
and refits when applied results change, including a single hotspot. It has no
hardcoded park center. A ranked list gives counts, coordinates and type breakdowns
without depending on map tiles. Invalid coordinates are filtered defensively.

## HWC event trends and embedded responses

Alert events use `createdAt` and reliable severity/status/source/type filters.
Ranger ID retains the existing analytics meaning of `acknowledgedBy` on an alert.
Incident Type is an incident filter and does not filter HWC alerts.

Response activity is fetched independently by `responses.respondedAt`, using the
same parent-alert filters. Responses to alerts created before the selected period
are therefore included. Only embedded responses whose own date falls inside the
inclusive period contribute. It is possible to have responses but zero newly
created alerts; that is meaningful data and is displayed without an empty alert
chart. Response actions and response time series are included.

HWC output has alert counts/time series, severity/status/source/type breakdowns,
response totals/actions/time series, and an explicit scope notice. Saved status
and severity describe current records, not historical state transitions. No
historical status reconstruction is claimed.

Time series use UTC calendar buckets:

| Inclusive period length | Bucket               |
| ----------------------- | -------------------- |
| Up to 31 days           | Day                  |
| 32–180 days             | Week starting Monday |
| 181–730 days            | Month                |
| More than 730 days      | Year                 |

Quiet buckets are zero-filled. First/last buckets may be partial; events outside
the applied period are not counted. Year buckets bound output for very long date
ranges accepted by Batch 1. No inferred growth percentage or prediction is added.

## UI and empty-data behaviour

Results are rendered from `appliedCriteria`, never edited draft categories.
Each implemented category has its own section, while Patrol Coverage still
explicitly reports that its algorithm is pending. A category with no matching
records gets an honest empty message; charts are not drawn for empty categories.
Overall no-data remains a successful informational empty panel. HWC scope is
visible even in that state. Overall matching status includes real alert/response
records when HWC is selected; these are not mislabeled as park-linked records.

Analyze is a primary green button and Reset a secondary outlined button, with
hover, focus, loading and disabled states. Download retains the existing basic
PDF action and applied criteria. It is disabled without meaningful matched data;
the scoped PDF endpoint also refuses an empty result if invoked directly. HWC
PDF summaries explicitly say ALL PARKS / UNASSIGNED. No preview, history, final
report lifecycle or new export format is added.

Validation remains a red accessible banner with inline field descriptions; API
errors remain a separate amber retry banner; no-data remains a blue informational
panel. Previous reviewed results survive failures. The existing Batch 1 tests
continue to verify these behaviours.

## Tests and limits

Backend tests exercise calculation helpers, UTC bucket boundaries, coordinate
validation, geographic separation/ranking, query scoping and filters, conditional
category details, independently dated responses, explicit HWC scope, and basic
PDF safeguards. Database calls are mocked at the Mongoose boundary; no live
MongoDB test or production-data write is performed.

Frontend tests render real Recharts SVGs and Leaflet circles under jsdom's layout
substitutes. They verify selected categories, exact tables/chart data, hotspot
maps/lists/empty states, global HWC labels, response-only activity, real button
styles, download safety and the preserved draft/applied workflow.

Remaining work is true Patrol Coverage / neglected areas, richer final integration
if needed, Generate Report -> Preview -> Export, and final test/coverage hardening.

## Verification results

- UC-D frontend: 34 passed across two suites, including all 23 prior workflow and
  validation tests.
- UC-D backend: 60 passed across three suites. Full backend: 108 passed across
  eight suites.
- Full frontend: 67 passed, three pre-existing failures. These are the same App
  manager-route text assertion, UC-C collar simulator button-text assertion and
  UC-C acknowledged-alert guidance assertion reproduced against the original
  analytics page during Batch 1. None of those files was modified.
- Frontend and backend TypeScript checks passed. Configured lint passed.
- Existing Vite/PWA production build and server TypeScript build passed. The
  existing large-chunk warning remains; no unrelated bundle redesign was made.
- `git diff --check` passed. No UC-A/UC-B/UC-C, shared models, package manifests,
  lockfiles, environment files or test/build configuration were changed.
