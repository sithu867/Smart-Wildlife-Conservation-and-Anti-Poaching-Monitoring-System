import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AnalyticsCriteriaError } from './criteriaService.js';
import { savedReportService, SavedReportError } from './savedReportService.js';
import {
  createStatisticalReportSchema,
  updateStatisticalReportSchema,
  reportIdSchema,
  reportHistoryQuerySchema,
} from './savedReportValidation.js';
import { REPORT_EXPORT_FORMATS } from './reportContract.js';
import { exportSavedReport } from './reportExportService.js';

function reportError(error: unknown, res: Response) {
  const status =
    error instanceof SavedReportError
      ? error.status
      : error instanceof z.ZodError || error instanceof AnalyticsCriteriaError
        ? 400
        : 500;
  res.status(status).json({
    success: false,
    error: {
      message:
        error instanceof SavedReportError ||
        error instanceof AnalyticsCriteriaError
          ? error.message
          : error instanceof z.ZodError
            ? 'Check the report criteria, title, notes and report ID. Unsupported fields are not allowed.'
            : 'Unable to complete the saved report request. Please try again.',
    },
  });
}
function action(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      await handler(req, res, next);
    } catch (error) {
      reportError(error, res);
    }
  };
}
const generate = action(async (req, res) => {
  const input = createStatisticalReportSchema.parse(req.body);
  res
    .status(201)
    .json({ success: true, data: await savedReportService.create(input) });
});
const list = action(async (req, res) => {
  const query = reportHistoryQuerySchema.parse(req.query);
  res.json({
    success: true,
    data: await savedReportService.list(query.cursor),
  });
});
const detail = action(async (req, res) => {
  res.json({
    success: true,
    data: await savedReportService.detail(
      reportIdSchema.parse(req.params.reportId),
    ),
  });
});
const update = action(async (req, res) => {
  const id = reportIdSchema.parse(req.params.reportId);
  const metadata = updateStatisticalReportSchema.parse(req.body);
  res.json({
    success: true,
    data: await savedReportService.update(id, metadata),
  });
});
const archive = action(async (req, res) => {
  await savedReportService.archive(reportIdSchema.parse(req.params.reportId));
  res.json({ success: true, data: { archived: true } });
});
const regenerate = action(async (req, res) => {
  z.object({}).strict().parse(req.body);
  res.status(201).json({
    success: true,
    data: await savedReportService.regenerate(
      reportIdSchema.parse(req.params.reportId),
    ),
  });
});
const exportPdf = action(async (req, res) => {
  z.object({}).strict().parse(req.query);
  const file = await exportSavedReport(
    reportIdSchema.parse(req.params.reportId),
    'pdf',
  );
  res
    .type(file.contentType)
    .set('Access-Control-Expose-Headers', 'Content-Disposition')
    .set('Content-Disposition', `attachment; filename="${file.filename}"`)
    .send(file.content);
});
const exportReport = action(async (req, res) => {
  const id = reportIdSchema.parse(req.params.reportId);
  const { format } = z
    .object({ format: z.enum(REPORT_EXPORT_FORMATS) })
    .strict()
    .parse(req.query);
  const file = await exportSavedReport(id, format);
  res
    .type(file.contentType)
    .set('Access-Control-Expose-Headers', 'Content-Disposition')
    .set('Content-Disposition', `attachment; filename="${file.filename}"`)
    .send(file.content);
});
export const conservationReportController = {
  generate,
  list,
  detail,
  update,
  archive,
  regenerate,
  exportPdf,
  exportReport,
};
