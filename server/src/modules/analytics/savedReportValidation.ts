import { z } from 'zod';
import { analysisCriteriaSchema, analysisParkIdSchema } from './validation.js';
import { normalizeAnalysisControls } from './contract.js';

const title = z
  .string()
  .trim()
  .min(1, 'Enter a report title.')
  .max(200, 'Title must be at most 200 characters.');
const notes = z
  .string()
  .trim()
  .max(5000, 'Notes must be at most 5000 characters.')
  .nullable();
export const createStatisticalReportSchema = z
  .object({
    criteria: z.preprocess(normalizeAnalysisControls, analysisCriteriaSchema),
    title: title.optional(),
    notes: notes.optional(),
  })
  .strict('Only analysis criteria, title and notes can be submitted.');

// Allow-list metadata rather than stripping unknown keys: tampering must fail visibly.
export const updateStatisticalReportSchema = z
  .object({
    title: title.optional(),
    notes: notes.optional(),
  })
  .strict('Only report title and notes can be edited.')
  .refine(
    (value) => value.title !== undefined || value.notes !== undefined,
    'Provide a title or notes to update.',
  );
export const reportIdSchema = analysisParkIdSchema;
export const reportHistoryQuerySchema = z
  .object({ cursor: reportIdSchema.optional() })
  .strict();
