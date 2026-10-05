import {
  ANALYSIS_CATEGORIES,
  isValidAnalysisDate,
  type AnalysisCriteria,
  type ParkOption,
} from '../../../../server/src/modules/analytics/contract';
import {
  AlertSeverity,
  AlertStatus,
  IncidentType,
} from '../../shared/types/enums';

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
  const errors: CriteriaValidationIssue[] = [];
  const addIssue = (field: CriteriaValidationIssue['field'], message: string) =>
    errors.push({ field, message });
  if (!parks.some((park) => park.id === criteria.parkId))
    addIssue('parkId', 'Select a valid Park / Conservation Area.');
  const startValid = isValidAnalysisDate(criteria.start);
  const endValid = isValidAnalysisDate(criteria.end);
  if (!startValid) addIssue('start', 'Enter a valid Start Date.');
  if (!endValid) addIssue('end', 'Enter a valid End Date.');
  if (startValid && endValid && criteria.start > criteria.end)
    addIssue('end', 'Start Date must be on or before End Date.');
  if (!criteria.categories.length)
    addIssue('categories', 'Select at least one analysis category.');
  if (
    criteria.categories.some(
      (category) => !ANALYSIS_CATEGORIES.includes(category),
    )
  )
    addIssue('categories', 'Unsupported analysis category.');
  if (
    criteria.incidentType &&
    !Object.values(IncidentType).some(
      (value) => value === criteria.incidentType,
    )
  )
    addIssue('incidentType', 'Select a valid incident type.');
  if (
    criteria.severity &&
    !Object.values(AlertSeverity).some((value) => value === criteria.severity)
  )
    addIssue('severity', 'Select a valid severity.');
  if (
    criteria.conflictStatus &&
    !Object.values(AlertStatus).some(
      (value) => value === criteria.conflictStatus,
    )
  )
    addIssue('conflictStatus', 'Select a valid conflict status.');
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
  return Object.fromEntries(
    Object.entries(criteria).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  );
}
