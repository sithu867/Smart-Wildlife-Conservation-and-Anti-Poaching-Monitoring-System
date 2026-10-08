import { z } from 'zod';
import { analysisCriteriaSchema, analysisParkIdSchema } from './validation.js';
import { normalizeAnalysisControls } from './contract.js';
import { reportMetadataFields } from './metadataValidation.js';

const { title, notes } = reportMetadataFields;
export const createStatisticalReportSchema = z
  .object({
    criteria: z.preprocess(normalizeAnalysisControls, analysisCriteriaSchema),
    title: title.optional(),
    notes: notes.optional(),
  })
  .strict('Only analysis criteria, title and notes can be submitted.');

// Metadata cannot change analytical evidence: allow-list title/notes and reject
// snapshot/criteria fields visibly rather than silently accepting tampering.
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
