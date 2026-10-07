import { z } from 'zod';
import {
  ANALYSIS_CATEGORIES,
  isValidAnalysisDate,
  isValidAnalysisId,
  isAnalysisDateRangeOrdered,
  includesElapsedAnalysisDay,
  MIN_ANALYSIS_DATE,
  SUPPORTED_DATE_MESSAGE,
  FUTURE_PERIOD_MESSAGE,
} from './contract.js';
import {
  AlertSeverity,
  AlertSource,
  AlertStatus,
  ConflictAlertType,
  IncidentStatus,
  IncidentType,
} from '../../types/enums.js';

const analysisDate = (label: string) =>
  z
    .string({
      required_error: `${label} is required.`,
      invalid_type_error: `${label} must be a valid date.`,
    })
    .refine(isValidAnalysisDate, (value) => ({
      message:
        /^\d{4}-\d{2}-\d{2}$/.test(value) && value < MIN_ANALYSIS_DATE
          ? SUPPORTED_DATE_MESSAGE
          : `${label} must be a valid date (YYYY-MM-DD).`,
    }));

export const analysisParkIdSchema = z
  .string({
    required_error: 'Select a Park / Conservation Area.',
    invalid_type_error: 'Select a valid Park / Conservation Area.',
  })
  .refine(isValidAnalysisId, 'Select a valid Park / Conservation Area.');

// Ranger IDs are external actor identifiers (e.g. R-101), not Prisma model IDs.
// Preserve that shared-module contract while rejecting blank/control-character input.
export const analysisFilterSchemas = {
  rangerId: z
    .string({ invalid_type_error: 'Enter a valid Ranger ID.' })
    .regex(/^[^\x00-\x1f\x7f]*$/, 'Enter a valid Ranger ID.')
    .trim()
    .min(1, 'Ranger ID must not be empty.')
    .max(2000, 'Ranger ID is too long.')
    .optional(),
  incidentType: z
    .nativeEnum(IncidentType, {
      errorMap: () => ({ message: 'Select a valid incident type.' }),
    })
    .optional(),
  incidentStatus: z
    .nativeEnum(IncidentStatus, {
      errorMap: () => ({ message: 'Select a valid incident status.' }),
    })
    .optional(),
  severity: z
    .nativeEnum(AlertSeverity, {
      errorMap: () => ({ message: 'Select a valid severity.' }),
    })
    .optional(),
  conflictStatus: z
    .nativeEnum(AlertStatus, {
      errorMap: () => ({ message: 'Select a valid conflict status.' }),
    })
    .optional(),
  conflictSource: z
    .nativeEnum(AlertSource, {
      errorMap: () => ({ message: 'Select a valid conflict source.' }),
    })
    .optional(),
  conflictType: z
    .nativeEnum(ConflictAlertType, {
      errorMap: () => ({ message: 'Select a valid conflict type.' }),
    })
    .optional(),
};

export const storedAnalysisCriteriaSchema = z
  .object({
    parkId: analysisParkIdSchema,
    start: analysisDate('Start Date'),
    end: analysisDate('End Date'),
    categories: z
      .array(
        z.enum(ANALYSIS_CATEGORIES, {
          errorMap: () => ({ message: 'Unsupported analysis category.' }),
        }),
        {
          required_error: 'Select at least one analysis category.',
          invalid_type_error: 'Analysis categories must be a list.',
        },
      )
      .min(1, 'Select at least one analysis category.')
      .transform((values) => [...new Set(values)]),
    ...analysisFilterSchemas,
  })
  .strict('Malformed analysis criteria: unsupported field.')
  .refine(
    (criteria) => isAnalysisDateRangeOrdered(criteria.start, criteria.end),
    {
      message: 'Start Date must be on or before End Date.',
      path: ['end'],
    },
  );

// Both the browser form and authoritative server entry points use this rule.
// Evaluate now at parse time so long-lived processes also honor UTC rollover.
export const analysisCriteriaSchema = storedAnalysisCriteriaSchema.refine(
  (criteria) => includesElapsedAnalysisDay(criteria.start),
  { message: FUTURE_PERIOD_MESSAGE, path: ['start'] },
);

export function analysisDateRange(criteria: { start: string; end: string }) {
  // Expand the inclusive end date to the end of its selected UTC day so records
  // later that day are included, regardless of server timezone or DST.
  return {
    start: new Date(`${criteria.start}T00:00:00.000Z`),
    end: new Date(`${criteria.end}T23:59:59.999Z`),
  };
}
