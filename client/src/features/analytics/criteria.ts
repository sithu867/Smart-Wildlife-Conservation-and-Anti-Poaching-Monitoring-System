import {
  normalizeAnalysisControls,
  isAnalysisDateRangeOrdered,
  type AnalysisCriteria,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import { analysisCriteriaSchema } from '../../../../server/src/modules/analytics/validation';

export function createDraftCriteria(): AnalysisCriteria {
  return {
    parkId: '',
    start: '',
    end: '',
    categories: ['INCIDENT_STATISTICS'],
    rangerId: '',
    incidentType: '',
    severity: '',
    conflictStatus: '',
  };
}

export function copyCriteria(criteria: AnalysisCriteria): AnalysisCriteria {
  // Copy the checkbox array too. Later reports must consume this reviewed
  // snapshot, never the editable draft.
  return { ...criteria, categories: [...criteria.categories] };
}

export type DatePresetDays = 7 | 30 | 90;

export function datePresetRange(days: DatePresetDays, now = new Date()) {
  // Include today as one of the N UTC calendar days. UTC setters avoid local
  // midnight/DST shifts; the API still expands the selected end to 23:59:59.999Z.
  const end = now.toISOString().slice(0, 10);
  const start = new Date(`${end}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end };
}

export function hasIncidentCategory(criteria: AnalysisCriteria): boolean {
  return criteria.categories.some(
    (category) =>
      category === 'INCIDENT_STATISTICS' || category === 'INCIDENT_HOTSPOTS',
  );
}

export interface CriteriaValidationIssue {
  field: keyof AnalysisCriteria | 'form';
  message: string;
}

export function validateDraftCriteriaIssues(
  criteria: AnalysisCriteria,
  parks: ParkOption[],
): CriteriaValidationIssue[] {
  // Typed form controls normally guarantee this shape. Still reject corrupted
  // runtime criteria before performing date or category-array operations.
  if (
    !criteria ||
    typeof criteria.parkId !== 'string' ||
    typeof criteria.start !== 'string' ||
    typeof criteria.end !== 'string' ||
    !Array.isArray(criteria.categories) ||
    (criteria.rangerId !== undefined && typeof criteria.rangerId !== 'string')
  ) {
    return [
      {
        field: 'form',
        message:
          'Malformed analysis criteria. Please check the criteria and try again.',
      },
    ];
  }
  const parsed = analysisCriteriaSchema.safeParse(
    normalizeAnalysisControls(criteria),
  );
  const errors: CriteriaValidationIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => {
        const field = (issue.path[0] ??
          'form') as CriteriaValidationIssue['field'];
        // Keep the existing inline date wording while sharing all validation rules.
        const message =
          field === 'parkId' && !criteria.parkId
            ? 'Select a Park / Conservation Area.'
            : (field === 'start' || field === 'end') &&
                !issue.message.includes('on or before')
              ? `Enter a valid ${field === 'start' ? 'Start' : 'End'} Date.`
              : issue.message;
        return { field, message };
      });
  if (
    !errors.some((issue) => issue.field === 'parkId') &&
    !parks.some((park) => park.id === criteria.parkId)
  ) {
    errors.push({
      field: 'parkId',
      message: 'Select a valid Park / Conservation Area.',
    });
  }
  // Zod can abort object refinements on malformed filters/categories. Still show
  // the independent date-range error so managers can correct both fields at once.
  if (
    !isAnalysisDateRangeOrdered(criteria.start, criteria.end) &&
    !errors.some(
      (issue) => issue.message === 'Start Date must be on or before End Date.',
    )
  ) {
    errors.push({
      field: 'end',
      message: 'Start Date must be on or before End Date.',
    });
  }
  return errors;
}

// Preserve the existing message-only validator for callers; both the summary
// and inline field feedback come from the same validation rules.
export function validateDraftCriteria(
  criteria: AnalysisCriteria,
  parks: ParkOption[],
): string[] {
  return validateDraftCriteriaIssues(criteria, parks).map(
    (issue) => issue.message,
  );
}

export function criteriaParams(criteria: AnalysisCriteria) {
  return normalizeAnalysisControls(criteria);
}
