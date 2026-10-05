import type { FormEvent } from 'react';
import {
  ANALYSIS_CATEGORIES,
  CATEGORY_LABELS,
  type AnalysisCriteria,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import {
  AlertSeverity,
  AlertStatus,
  IncidentType,
} from '../../shared/types/enums';
import type { CriteriaValidationIssue } from './criteria';
import { FeedbackPanel } from './AnalyticsFeedback';

interface Props {
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
  onRetryParks: () => void;
}
export function AnalysisCriteriaForm({
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
  onRetryParks,
}: Props) {
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
        <h2>{hasResults ? 'Refine Analysis' : 'Select Analysis Criteria'}</h2>
        <p>
          {hasResults
            ? 'Adjust the criteria to get a more focused view.'
            : 'Choose a park, time period and the analytics you want to review.'}
        </p>
      </div>
      <h3>Park and Time Period</h3>
      <div className="analytics-filters">
        <div className="analytics-field">
          <label>
            Park / Conservation Area
            <select
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
          {fieldFeedback('parkId')}
        </div>
        <div className="analytics-field">
          <label>
            Start Date
            <input
              type="date"
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
              {...fieldAccessibility('end')}
              value={criteria.end}
              onChange={(event) => onEdit('end', event.target.value)}
            />
          </label>
          {fieldFeedback('end')}
        </div>
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
        <div className="analytics-filters">
          <div className="analytics-field">
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
            <label>
              Incident type
              <select
                {...fieldAccessibility('incidentType')}
                value={criteria.incidentType}
                onChange={(event) => onEdit('incidentType', event.target.value)}
              >
                <option value="">All types</option>
                {Object.values(IncidentType).map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('incidentType')}
          </div>
          <div className="analytics-field">
            <label>
              Severity
              <select
                {...fieldAccessibility('severity')}
                value={criteria.severity}
                onChange={(event) => onEdit('severity', event.target.value)}
              >
                <option value="">All severities</option>
                {Object.values(AlertSeverity).map((severity) => (
                  <option key={severity}>{severity}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('severity')}
          </div>
          <div className="analytics-field">
            <label>
              Conflict status
              <select
                {...fieldAccessibility('conflictStatus')}
                value={criteria.conflictStatus}
                onChange={(event) =>
                  onEdit('conflictStatus', event.target.value)
                }
              >
                <option value="">All statuses</option>
                {Object.values(AlertStatus).map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            {fieldFeedback('conflictStatus')}
          </div>
        </div>
      </section>
      <p className="analytics-criteria-help">
        End Date includes the entire selected day (UTC). Ranger ID filters
        patrol activity across all park routes. Conflict trends cover all parks
        / unassigned alerts, not the selected park.
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
    </form>
  );
}
