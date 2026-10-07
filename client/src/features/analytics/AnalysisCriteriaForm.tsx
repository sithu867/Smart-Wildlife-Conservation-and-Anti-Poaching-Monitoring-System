import type { FormEvent, Ref } from 'react';
import {
  ANALYSIS_CATEGORIES,
  CATEGORY_LABELS,
  isValidAnalysisDate,
  MIN_ANALYSIS_DATE,
  type AnalysisCriteria,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import {
  AlertSeverity,
  AlertStatus,
  IncidentType,
} from '../../shared/types/enums';
import {
  hasIncidentCategory,
  type CriteriaValidationIssue,
  type DatePresetDays,
} from './criteria';
import { FeedbackPanel } from './AnalyticsFeedback';
import { formatEnumLabel } from './formatting';

interface Props {
  formRef?: Ref<HTMLFormElement>;
  criteria: AnalysisCriteria;
  parks: ParkOption[];
  parksLoading: boolean;
  parksError: string;
  validationErrors: CriteriaValidationIssue[];
  loading: boolean;
  hasResults: boolean;
  draftChanged: boolean;
  onEdit: <K extends keyof AnalysisCriteria>(
    key: K,
    value: AnalysisCriteria[K],
  ) => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  onDatePreset: (days: DatePresetDays) => void;
  onRetryParks: () => void;
}
export function AnalysisCriteriaForm({
  formRef,
  criteria,
  parks,
  parksLoading,
  parksError,
  validationErrors,
  loading,
  hasResults,
  draftChanged,
  onEdit,
  onSubmit,
  onReset,
  onDatePreset,
  onRetryParks,
}: Props) {
  const incidentsSelected = hasIncidentCategory(criteria);
  const conflictsSelected = criteria.categories.includes('HWC_TRENDS');
  const selectedPark = parks.find((park) => park.id === criteria.parkId);
  function openCalendar(input: HTMLInputElement) {
    // showPicker requires a user gesture and is not available in every browser.
    // The native date control remains usable when unsupported or restricted.
    try {
      input.showPicker?.();
    } catch {
      /* Browser retains its native fallback. */
    }
  }
  function fieldAccessibility(field: keyof AnalysisCriteria) {
    const invalid = validationErrors.some((issue) => issue.field === field);
    return {
      'aria-invalid': invalid,
      'aria-describedby': invalid ? `analytics-error-${field}` : undefined,
    };
  }

  function fieldFeedback(field: keyof AnalysisCriteria) {
    const messages = validationErrors
      .filter((issue) => issue.field === field)
      .map((issue) => issue.message);
    return messages.length ? (
      <p className="analytics-field-error" id={`analytics-error-${field}`}>
        {messages.join(' ')}
      </p>
    ) : null;
  }

  return (
    <form
      ref={formRef}
      id="analytics-criteria"
      className="card analytics-criteria"
      onSubmit={onSubmit}
      noValidate
      aria-label="Analysis criteria"
    >
      <div className="analytics-section-heading">
        <p className="eyebrow">
          {hasResults ? 'Focus your insights' : 'Set your scope'}
        </p>
        <h2 tabIndex={-1}>
          {hasResults ? 'Refine Analysis' : 'Select Analysis Criteria'}
        </h2>
        <p>
          {hasResults
            ? 'Adjust the criteria to get a more focused view.'
            : 'Choose a park, time period and the analytics you want to review.'}
        </p>
      </div>
      <p className="analytics-criteria-help">
        Park, dates and at least one category are required.
      </p>
      <h3>Park and Time Period</h3>
      <div className="analytics-filters">
        <div className="analytics-field">
          <label>
            Park / Conservation Area
            <select
              required
              {...fieldAccessibility('parkId')}
              value={criteria.parkId}
              onChange={(event) => onEdit('parkId', event.target.value)}
              disabled={parksLoading || !!parksError}
            >
              <option value="">Select a park</option>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>
                  {park.name} ({park.code})
                </option>
              ))}
            </select>
          </label>
          {selectedPark && (
            <p className="analytics-selected-park">
              {selectedPark.name} ({selectedPark.code})
            </p>
          )}
          {fieldFeedback('parkId')}
        </div>
        <div className="analytics-field">
          <label>
            Start Date
            <input
              type="date"
              required
              min={MIN_ANALYSIS_DATE}
              max={isValidAnalysisDate(criteria.end) ? criteria.end : undefined}
              onClick={(event) => openCalendar(event.currentTarget)}
              {...fieldAccessibility('start')}
              value={criteria.start}
              onChange={(event) => onEdit('start', event.target.value)}
            />
          </label>
          {fieldFeedback('start')}
        </div>
        <div className="analytics-field">
          <label>
            End Date
            <input
              type="date"
              required
              min={
                isValidAnalysisDate(criteria.start)
                  ? criteria.start
                  : MIN_ANALYSIS_DATE
              }
              onClick={(event) => openCalendar(event.currentTarget)}
              {...fieldAccessibility('end')}
              value={criteria.end}
              onChange={(event) => onEdit('end', event.target.value)}
            />
          </label>
          {fieldFeedback('end')}
        </div>
      </div>
      <div
        className="analytics-date-presets"
        role="group"
        aria-label="Date presets"
      >
        {([7, 30, 90] as const).map((days) => (
          <button
            key={days}
            type="button"
            className="button analytics-button analytics-button--secondary"
            onClick={() => onDatePreset(days)}
          >
            Last {days} Days
          </button>
        ))}
        <p className="analytics-criteria-help">
          Presets include today in UTC. Dates remain editable; select{' '}
          {hasResults ? 'Update Analysis' : 'Analyze'} to apply.
        </p>
      </div>
      <fieldset
        className="analytics-categories"
        {...fieldAccessibility('categories')}
      >
        <legend>Analysis Categories (select one or more)</legend>
        {ANALYSIS_CATEGORIES.map((category) => (
          <label key={category}>
            <input
              type="checkbox"
              {...fieldAccessibility('categories')}
              checked={criteria.categories.includes(category)}
              onChange={(event) =>
                onEdit(
                  'categories',
                  event.target.checked
                    ? [...criteria.categories, category]
                    : criteria.categories.filter((value) => value !== category),
                )
              }
            />
            {CATEGORY_LABELS[category]}
          </label>
        ))}
        {fieldFeedback('categories')}
      </fieldset>
      <section className="analytics-advanced" aria-label="Advanced Filters">
        <h3>
          Advanced Filters <span>Optional</span>
        </h3>
        <p className="analytics-criteria-help">
          Blank / All means no filter. Incident filters apply to statistics and
          hotspots; conflict filters apply only to Human-Wildlife Conflict
          Trends. Inactive values are kept for when you reselect that category.
        </p>
        <div className="analytics-filters">
          <div className="analytics-field">
            <p className="analytics-filter-scope">Selected categories</p>
            <label>
              Ranger ID
              <input
                placeholder="All rangers"
                {...fieldAccessibility('rangerId')}
                value={criteria.rangerId}
                onChange={(event) => onEdit('rangerId', event.target.value)}
              />
            </label>
            {fieldFeedback('rangerId')}
          </div>
          <div className="analytics-field">
            <p className="analytics-filter-scope">
              Incident categories{!incidentsSelected && ' · Not selected'}
            </p>
            <label>
              Incident type
              <select
                disabled={!incidentsSelected}
                {...fieldAccessibility('incidentType')}
                value={criteria.incidentType}
                onChange={(event) => onEdit('incidentType', event.target.value)}
              >
                <option value="">All types</option>
                {Object.values(IncidentType).map((type) => (
                  <option key={type} value={type}>
                    {formatEnumLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            {fieldFeedback('incidentType')}
          </div>
          <div className="analytics-field">
            <p className="analytics-filter-scope">
              Conflict trends{!conflictsSelected && ' · Not selected'}
            </p>
            <label>
              Severity
              <select
                disabled={!conflictsSelected}
                {...fieldAccessibility('severity')}
                value={criteria.severity}
                onChange={(event) => onEdit('severity', event.target.value)}
              >
                <option value="">All severities</option>
                {Object.values(AlertSeverity).map((severity) => (
                  <option key={severity} value={severity}>
                    {formatEnumLabel(severity)}
                  </option>
                ))}
              </select>
            </label>
            {fieldFeedback('severity')}
          </div>
          <div className="analytics-field">
            <p className="analytics-filter-scope">
              Conflict trends{!conflictsSelected && ' · Not selected'}
            </p>
            <label>
              Conflict status
              <select
                disabled={!conflictsSelected}
                {...fieldAccessibility('conflictStatus')}
                value={criteria.conflictStatus}
                onChange={(event) =>
                  onEdit('conflictStatus', event.target.value)
                }
              >
                <option value="">All statuses</option>
                {Object.values(AlertStatus).map((status) => (
                  <option key={status} value={status}>
                    {formatEnumLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            {fieldFeedback('conflictStatus')}
          </div>
        </div>
      </section>
      <p className="analytics-criteria-help">
        End Date includes the entire selected day (UTC). Ranger ID filters
        patrol activity across selected-park routes, incident reporters and
        conflict acknowledging rangers. All categories use the selected park;
        unassigned incidents and alerts are excluded.
      </p>
      {parksLoading && <p role="status">Loading parks...</p>}
      {parksError && (
        <FeedbackPanel tone="system" title="Parks could not be loaded">
          <p>{parksError}</p>
          <button type="button" onClick={onRetryParks}>
            Retry loading parks
          </button>
        </FeedbackPanel>
      )}
      {!parksLoading && !parksError && !parks.length && (
        <p role="status">
          No parks are available. Add real park data before analyzing.
        </p>
      )}
      {!!validationErrors.length && (
        <FeedbackPanel tone="validation" title="Check the analysis criteria">
          <p>
            Correct the highlighted fields, then select{' '}
            {hasResults ? 'Update Analysis' : 'Analyze'}.
          </p>
          <ul>
            {validationErrors.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </FeedbackPanel>
      )}
      {draftChanged && (
        <p className="analytics-draft-notice" role="status">
          Criteria have changed. Update Analysis to apply them. Displayed
          results still use the applied criteria.
        </p>
      )}
      <div className="analytics-actions">
        <button
          className="button analytics-button analytics-button--primary"
          type="submit"
          disabled={loading || parksLoading || !!parksError || !parks.length}
        >
          {loading
            ? 'Analyzing...'
            : hasResults
              ? 'Update Analysis'
              : 'Analyze'}
        </button>
        <button
          className="button analytics-button analytics-button--secondary"
          type="button"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
      <p className="analytics-criteria-help">
        Reset clears this draft and displayed analysis, keeping Incident
        Statistics selected. Stored conservation records are unchanged.
      </p>
    </form>
  );
}
