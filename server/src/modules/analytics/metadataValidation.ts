import { z } from 'zod';

export const REPORT_METADATA_MESSAGES = {
  title: {
    type: 'Enter a valid report title.',
    required: 'Enter a report title (1-200 characters).',
    length: 'Title must be at most 200 characters.',
  },
  notes: {
    type: 'Enter valid report notes.',
    length: 'Notes must be at most 5000 characters.',
  },
} as const;

// Share the exact trimming/length rules with the form; the server still validates
// every write, including clients that bypass the form or native input limits.
export const reportMetadataFields = {
  title: z
    .string({
      required_error: REPORT_METADATA_MESSAGES.title.required,
      invalid_type_error: REPORT_METADATA_MESSAGES.title.type,
    })
    .trim()
    .min(1, REPORT_METADATA_MESSAGES.title.required)
    .max(200, REPORT_METADATA_MESSAGES.title.length),
  notes: z
    .string({ invalid_type_error: REPORT_METADATA_MESSAGES.notes.type })
    .trim()
    .max(5000, REPORT_METADATA_MESSAGES.notes.length)
    .nullable(),
};
export const reportMetadataSchema = z.object(reportMetadataFields);
export type ReportMetadataErrors = Partial<Record<'title' | 'notes', string>>;

export function safeMetadataErrors(value: unknown): ReportMetadataErrors {
  const errors: ReportMetadataErrors = {};
  if (!value || typeof value !== 'object') return errors;
  for (const field of ['title', 'notes'] as const) {
    const message = (value as Record<string, unknown>)[field];
    // Never render arbitrary proxy/server text as a field error.
    if (
      typeof message === 'string' &&
      Object.values(REPORT_METADATA_MESSAGES[field]).some(
        (safe) => safe === message,
      )
    )
      errors[field] = message;
  }
  return errors;
}

export function metadataIssueErrors(
  issues: ReadonlyArray<{ path: (string | number)[]; message: string }>,
): ReportMetadataErrors {
  return safeMetadataErrors(
    Object.fromEntries(
      issues
        .filter((issue) => issue.path.length === 1)
        .map((issue) => [issue.path[0], issue.message]),
    ),
  );
}
