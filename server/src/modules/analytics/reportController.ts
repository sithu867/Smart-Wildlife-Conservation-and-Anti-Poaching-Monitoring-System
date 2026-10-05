import type { RequestHandler } from 'express';
import { z } from 'zod';
import { validateReportSnapshot } from './reportValidation.js';
import { generateReportPdf } from './reportPdf.js';
import { reportFilename } from './reportContract.js';

function reportError(
  error: unknown,
  res: Parameters<RequestHandler>[1],
  action: 'generate' | 'export',
) {
  res.status(error instanceof z.ZodError ? 400 : 500).json({
    success: false,
    error: {
      message:
        error instanceof z.ZodError
          ? 'The report snapshot is invalid. Review the applied analysis and try again.'
          : `Unable to ${action} the report. Please try again.`,
    },
  });
}
const generate: RequestHandler = (req, res) => {
  try {
    const report = validateReportSnapshot(req.body);
    res.set('Cache-Control', 'no-store').json({ success: true, data: report });
  } catch (error) {
    reportError(error, res, 'generate');
  }
};
const exportPdf: RequestHandler = (req, res) => {
  try {
    // Export consumes the retained snapshot, never querying analytics again.
    // A retry therefore exports the same findings the Park Manager previewed.
    const report = validateReportSnapshot(req.body);
    const pdf = generateReportPdf(report);
    res
      .set('Cache-Control', 'no-store')
      .type('application/pdf')
      .set(
        'Content-Disposition',
        `attachment; filename="${reportFilename(report)}"`,
      )
      .send(pdf);
  } catch (error) {
    reportError(error, res, 'export');
  }
};
export const conservationReportController = { generate, exportPdf };
