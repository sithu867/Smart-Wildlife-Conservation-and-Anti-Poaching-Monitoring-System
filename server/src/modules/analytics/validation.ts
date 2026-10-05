import { z } from 'zod';
import { ANALYSIS_CATEGORIES, isValidAnalysisDate } from './contract.js';
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
    .refine(isValidAnalysisDate, `${label} must be a valid date (YYYY-MM-DD).`);

export const analysisCriteriaSchema = z
  .object({
    parkId: z
      .string({ required_error: 'Select a Park / Conservation Area.' })
      .regex(/^[a-f\d]{24}$/i, 'Select a valid Park / Conservation Area.'),
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
    rangerId: z
      .string()
      .trim()
      .min(1, 'Ranger ID must not be empty.')
      .optional(),
    incidentType: z.nativeEnum(IncidentType).optional(),
    incidentStatus: z.nativeEnum(IncidentStatus).optional(),
    severity: z.nativeEnum(AlertSeverity).optional(),
    conflictStatus: z.nativeEnum(AlertStatus).optional(),
    conflictSource: z.nativeEnum(AlertSource).optional(),
    conflictType: z.nativeEnum(ConflictAlertType).optional(),
  })
  .strict('Malformed analysis criteria: unsupported field.')
  .refine(
    (criteria) =>
      !isValidAnalysisDate(criteria.start) ||
      !isValidAnalysisDate(criteria.end) ||
      criteria.start <= criteria.end,
    {
      message: 'Start Date must be on or before End Date.',
      path: ['end'],
    },
  );

export function analysisDateRange(criteria: { start: string; end: string }) {
  // Criteria retain calendar dates; only the MongoDB query expands the inclusive
  // end date. UTC avoids server timezone and daylight-saving differences.
  return {
    start: new Date(`${criteria.start}T00:00:00.000Z`),
    end: new Date(`${criteria.end}T23:59:59.999Z`),
  };
}
