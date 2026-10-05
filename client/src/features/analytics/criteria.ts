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

export function validateDraftCriteria(
  criteria: AnalysisCriteria,
  parks: ParkOption[],
): string[] {
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
      'Malformed analysis criteria. Please check the criteria and try again.',
    ];
  }
  const errors: string[] = [];
  if (!parks.some((park) => park.id === criteria.parkId))
    errors.push('Select a valid Park / Conservation Area.');
  const startValid = isValidAnalysisDate(criteria.start);
  const endValid = isValidAnalysisDate(criteria.end);
  if (!startValid) errors.push('Enter a valid Start Date.');
  if (!endValid) errors.push('Enter a valid End Date.');
  if (startValid && endValid && criteria.start > criteria.end)
    errors.push('Start Date must be on or before End Date.');
  if (!criteria.categories.length)
    errors.push('Select at least one analysis category.');
  if (
    criteria.categories.some(
      (category) => !ANALYSIS_CATEGORIES.includes(category),
    )
  )
    errors.push('Unsupported analysis category.');
  if (
    criteria.incidentType &&
    !Object.values(IncidentType).some(
      (value) => value === criteria.incidentType,
    )
  )
    errors.push('Select a valid incident type.');
  if (
    criteria.severity &&
    !Object.values(AlertSeverity).some((value) => value === criteria.severity)
  )
    errors.push('Select a valid severity.');
  if (
    criteria.conflictStatus &&
    !Object.values(AlertStatus).some(
      (value) => value === criteria.conflictStatus,
    )
  )
    errors.push('Select a valid conflict status.');
  return errors;
}

export function criteriaParams(criteria: AnalysisCriteria) {
  return Object.fromEntries(
    Object.entries(criteria).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  );
}
